package local.bank.channel;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TransferProcessor {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  public TransferProcessor(JdbcTemplate jdbc, FineractAdapter fineract) { this.jdbc = jdbc; this.fineract = fineract; }

  @Transactional
  public Map<String, Object> process(UUID transferId) {
    var rows = jdbc.query("SELECT source_account_id,destination_account_id,amount,currency,status,idempotency_key FROM transfer WHERE transfer_id = ? FOR UPDATE", (rs, n) -> Map.<String,Object>of("source", rs.getString(1), "destination", rs.getString(2), "amount", rs.getBigDecimal(3), "currency", rs.getString(4), "status", rs.getString(5), "key", rs.getString(6)), transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    Map<String,Object> row = rows.get(0);
    if (!"RECEIVED".equals(row.get("status"))) return Map.of("transferId", transferId.toString(), "status", row.get("status"));
    jdbc.update("UPDATE transfer SET status='PROCESSING' WHERE transfer_id=?", transferId);
    Map<String,Object> core = fineract.accountTransfer(Long.parseLong((String) row.get("source")), Long.parseLong((String) row.get("destination")), (BigDecimal) row.get("amount"), (String) row.get("currency"), (String) row.get("key"));
    String reference = String.valueOf(core == null ? "" : core.getOrDefault("resourceId", core.getOrDefault("id", "")));
    jdbc.update("UPDATE transfer SET status='POSTED', core_reference=? WHERE transfer_id=?", reference, transferId);
    jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)", UUID.randomUUID(), transferId, "transfer.status.changed", "{\"transferId\":\"" + transferId + "\",\"status\":\"POSTED\"}");
    return Map.of("transferId", transferId.toString(), "status", "POSTED", "coreReference", reference);
  }
}
