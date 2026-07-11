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
  private final AuditService audit;

  public TransferProcessor(JdbcTemplate jdbc, FineractAdapter fineract, AuditService audit) {
    this.jdbc = jdbc;
    this.fineract = fineract;
    this.audit = audit;
  }

  @Transactional
  public Map<String, Object> process(UUID transferId) {
    var rows = jdbc.query(
        "SELECT source_account_id,destination_account_id,amount,currency,status,idempotency_key,subject FROM transfer WHERE transfer_id = ? FOR UPDATE",
        (rs, n) -> {
          var m = new java.util.HashMap<String, Object>();
          m.put("source", rs.getString(1));
          m.put("destination", rs.getString(2));
          m.put("amount", rs.getBigDecimal(3));
          m.put("currency", rs.getString(4));
          m.put("status", rs.getString(5));
          m.put("key", rs.getString(6));
          m.put("subject", rs.getString(7));
          return m;
        }, transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");

    Map<String, Object> row = rows.get(0);
    String currentStatus = (String) row.get("status");

    if (!"CREATED".equals(currentStatus) && !"VALIDATING".equals(currentStatus))
      return Map.of("transferId", transferId.toString(), "status", currentStatus);

    if ("CREATED".equals(currentStatus)) {
      transitionState(transferId, "CREATED", "VALIDATING", "SYSTEM", "transfer-processor");
    }

    transitionState(transferId, "VALIDATING", "PENDING_CORE_POSTING", "SYSTEM", "transfer-processor");

    Map<String, Object> core;
    try {
      core = fineract.accountTransfer(
          Long.parseLong((String) row.get("source")),
          Long.parseLong((String) row.get("destination")),
          (BigDecimal) row.get("amount"),
          (String) row.get("currency"),
          (String) row.get("key"));
    } catch (RuntimeException ex) {
      String rawReason = ex instanceof org.springframework.web.client.HttpClientErrorException http
          ? http.getStatusCode() + " " + http.getResponseBodyAsString()
          : ex.getMessage();
      String reason = rawReason == null ? "Core transfer rejected" : rawReason.substring(0, Math.min(240, rawReason.length()));
      jdbc.update("UPDATE transfer SET status='FAILED', failure_reason=? WHERE transfer_id=?", reason, transferId);
      transitionState(transferId, "PENDING_CORE_POSTING", "FAILED", "SYSTEM", "transfer-processor", reason);
      jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)",
          UUID.randomUUID(), transferId, "transfer.status.changed",
          "{\"transferId\":\"" + transferId + "\",\"status\":\"FAILED\"}");
      audit.record("TRANSFER_FAILED", "SYSTEM", "transfer-processor", "Transfer", transferId.toString(), "PROCESS", "FAILED", null, Map.of("reason", reason));
      return Map.of("transferId", transferId.toString(), "status", "FAILED", "failureReason", reason);
    }

    String reference = String.valueOf(core == null ? "" : core.getOrDefault("resourceId", core.getOrDefault("id", "")));
    jdbc.update("UPDATE transfer SET status='SETTLED', core_reference=? WHERE transfer_id=?", reference, transferId);
    transitionState(transferId, "PENDING_CORE_POSTING", "SETTLED", "SYSTEM", "transfer-processor");
    String corrId = (String) row.get("key");
    jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)",
        UUID.randomUUID(), transferId, "transfer.status.changed",
        "{\"transferId\":\"" + transferId + "\",\"status\":\"SETTLED\"}");
    jdbc.update("INSERT INTO ledger_entry(entry_id,account_id,debit,credit,correlation_id,transfer_id) VALUES (?,?,?,?,?,?)",
        UUID.randomUUID(), Long.parseLong((String) row.get("source")), ((java.math.BigDecimal) row.get("amount")), java.math.BigDecimal.ZERO, corrId, transferId);
    jdbc.update("INSERT INTO ledger_entry(entry_id,account_id,debit,credit,correlation_id,transfer_id) VALUES (?,?,?,?,?,?)",
        UUID.randomUUID(), Long.parseLong((String) row.get("destination")), java.math.BigDecimal.ZERO, ((java.math.BigDecimal) row.get("amount")), corrId, transferId);

    String receiptPayload = "{\"transferId\":\"" + transferId + "\",\"amount\":\"" + row.get("amount")
        + "\",\"currency\":\"" + row.get("currency") + "\",\"status\":\"SETTLED\",\"coreReference\":\"" + reference + "\"}";
    String receiptHash = sha256(receiptPayload);
    if (row.get("subject") != null) {
      jdbc.update("INSERT INTO transfer_receipt(receipt_id,transfer_id,subject,payload,sha256) VALUES (?,?,?,?,?) ON CONFLICT (transfer_id) DO NOTHING",
          UUID.randomUUID(), transferId, (String) row.get("subject"), receiptPayload, receiptHash);
      jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES (?,?,?,?)",
          UUID.randomUUID(), (String) row.get("subject"), "TRANSFER_SETTLED", receiptPayload);
    }
    audit.record("TRANSFER_SETTLED", "SYSTEM", "transfer-processor", "Transfer", transferId.toString(), "PROCESS", "SUCCESS", null, Map.of("coreReference", reference));
    return Map.of("transferId", transferId.toString(), "status", "SETTLED", "coreReference", reference);
  }

  private void transitionState(UUID transferId, String from, String to, String actorType, String actorId) {
    transitionState(transferId, from, to, actorType, actorId, null);
  }

  private void transitionState(UUID transferId, String from, String to, String actorType, String actorId, String reasonCode) {
    if (reasonCode != null && reasonCode.length() > 64) reasonCode = reasonCode.substring(0, 64);
    jdbc.update("INSERT INTO transfer_state_history(transfer_id,from_status,to_status,reason_code,actor_type,actor_id,metadata) VALUES (?,?,?,?,?,?,?::jsonb)",
        transferId, from, to, reasonCode, actorType, actorId, "{}");
  }

  private static String sha256(String input) {
    try {
      var d = java.security.MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(d);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
