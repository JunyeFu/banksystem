package local.bank.channel.reconciliation;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractAdapter;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReconciliationService {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;

  public ReconciliationService(JdbcTemplate jdbc, FineractAdapter fineract) {
    this.jdbc = jdbc;
    this.fineract = fineract;
  }

  @Transactional
  public Map<String, Object> run(String type) {
    String correlationId = MDC.get("correlationId");
    if (correlationId == null) correlationId = "no-correlation";

    if (!java.util.Set.of("CHANNEL_TO_CORE", "CHANNEL_TO_CLEARING", "CORE_TO_GENERAL_LEDGER").contains(type))
      throw new IllegalArgumentException("Unsupported reconciliation type");

    int differences;
    String message;

    if (type.equals("CHANNEL_TO_CORE")) {
      differences = jdbc.queryForObject(
          "SELECT count(*) FROM transfer_order WHERE status='SETTLED' AND (core_reference IS NULL OR core_reference='')",
          Integer.class);
      message = differences == 0
          ? "Every settled channel transfer has a Fineract reference"
          : "Settled transfer is missing a Fineract reference";

    } else if (type.equals("CHANNEL_TO_CLEARING")) {
      differences = jdbc.queryForObject(
          "SELECT count(*) FROM clearing_payment c LEFT JOIN transfer_order t ON t.transfer_id=c.transfer_id " +
          "WHERE c.status='SETTLED' AND (t.transfer_id IS NULL OR t.status NOT IN ('SETTLED','REVERSED') " +
          "OR t.core_reference IS NULL OR t.core_reference='')",
          Integer.class);
      message = differences == 0
          ? "Clearing settlement statuses and core references are aligned"
          : "Clearing settlement differs from channel transfer status or core posting";

    } else {
      int missingRef = jdbc.queryForObject(
          "SELECT count(*) FROM transfer_order WHERE status IN ('SETTLED','REVERSED') AND (core_reference IS NULL OR core_reference='')",
          Integer.class);
      var entries = fineract.journalEntries();
      BigDecimal debits = BigDecimal.ZERO;
      BigDecimal credits = BigDecimal.ZERO;
      for (var entry : entries) {
        var amount = new BigDecimal(String.valueOf(entry.getOrDefault("amount", "0")));
        Object entryTypeObj = entry.get("entryType");
        String entryType = "";
        if (entryTypeObj instanceof Map<?, ?> etm) entryType = String.valueOf(etm.get("value"));
        else entryType = String.valueOf(entryTypeObj);
        if ("DEBIT".equals(entryType)) debits = debits.add(amount);
        else if ("CREDIT".equals(entryType)) credits = credits.add(amount);
      }
      differences = missingRef;
      if (debits.compareTo(credits) != 0) differences++;
      message = debits.compareTo(credits) == 0
          ? "Core references and journal debit/credit totals are balanced"
          : "Journal debit/credit totals are not balanced: debits=" + debits + " credits=" + credits;
    }

    UUID id = UUID.randomUUID();
    String status = differences == 0 ? "MATCHED" : "DIFFERENCE";
    String detailsJson = "{\"correlationId\":\"" + correlationId + "\",\"message\":\"" + message.replace("\"", "\\\"") + "\",\"differenceCount\":" + differences + "}";
    jdbc.update("INSERT INTO reconciliation_run(run_id,reconciliation_type,status,difference_count,details) VALUES(?,?,?,?,?::jsonb)",
        id, type, status, differences, detailsJson);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("runId", id.toString());
    result.put("type", type);
    result.put("status", status);
    result.put("differenceCount", differences);
    result.put("details", detailsJson);
    result.put("correlationId", correlationId);
    return result;
  }

  public Map<String, Object> latest() {
    var rows = jdbc.query(
        "SELECT run_id,reconciliation_type,status,difference_count,details FROM reconciliation_run ORDER BY created_at DESC LIMIT 1",
        (rs, n) -> {
          var m = new LinkedHashMap<String, Object>();
          m.put("runId", rs.getString(1));
          m.put("type", rs.getString(2));
          m.put("status", rs.getString(3));
          m.put("differenceCount", rs.getInt(4));
          m.put("details", rs.getString(5));
          return m;
        });
    return rows.isEmpty() ? Map.of("status", "NOT_STARTED") : rows.get(0);
  }
}
