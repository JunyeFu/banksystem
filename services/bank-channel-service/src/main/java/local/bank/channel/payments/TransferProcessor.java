package local.bank.channel.payments;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import local.bank.channel.audit.AuditService;
import local.bank.channel.FineractAdapter;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;

@Service
public class TransferProcessor {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;

  public TransferProcessor(JdbcTemplate jdbc, FineractAdapter fineract, AuditService audit,
                           TransferStateMachine stateMachine) {
    this.jdbc = jdbc;
    this.fineract = fineract;
    this.audit = audit;
    this.stateMachine = stateMachine;
  }

  @Transactional
  public Map<String, Object> process(UUID transferId) {
    var rows = jdbc.query(
        "SELECT source_account_id,destination_account_id,amount,currency,status,idempotency_key,subject "
            + "FROM transfer_order WHERE transfer_id = ? FOR UPDATE",
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
    Status current = Status.of((String) row.get("status"));

    Status fromStatus;
    switch (current) {
      case CREATED:
        stateMachine.transitionState(transferId, Status.CREATED, Status.VALIDATING,
            "SYSTEM", "transfer-processor");
        stateMachine.transitionState(transferId, Status.VALIDATING, Status.PENDING_APPROVAL,
            "SYSTEM", "transfer-processor");
        stateMachine.transitionState(transferId, Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING,
            "SYSTEM", "transfer-processor");
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "transfer-processor");
        fromStatus = Status.PENDING_CLEARING;
        break;
      case VALIDATING:
        stateMachine.transitionState(transferId, Status.VALIDATING, Status.PENDING_APPROVAL,
            "SYSTEM", "transfer-processor");
        stateMachine.transitionState(transferId, Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING,
            "SYSTEM", "transfer-processor");
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "transfer-processor");
        fromStatus = Status.PENDING_CLEARING;
        break;
      case PENDING_CORE_POSTING:
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "transfer-processor");
        fromStatus = Status.PENDING_CLEARING;
        break;
      case PENDING_CLEARING:
        fromStatus = Status.PENDING_CLEARING;
        break;
      default:
        return Map.of("transferId", transferId.toString(), "status", current.name());
    }

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
      String reason = rawReason == null ? "Core transfer rejected"
          : rawReason.substring(0, Math.min(240, rawReason.length()));
      stateMachine.transitionState(transferId, fromStatus, Status.FAILED,
          "SYSTEM", "transfer-processor", reason, Map.of("reason", reason));
      audit.record("TRANSFER_FAILED", "SYSTEM", "transfer-processor", "Transfer",
          transferId.toString(), "PROCESS", "FAILED", null, Map.of("reason", reason));
      return Map.of("transferId", transferId.toString(), "status", "FAILED",
          "failureReason", reason);
    }

    String reference = String.valueOf(core == null ? ""
        : core.getOrDefault("resourceId", core.getOrDefault("id", "")));
    jdbc.update("UPDATE transfer_order SET core_reference=? WHERE transfer_id=?", reference, transferId);
    stateMachine.transitionState(transferId, fromStatus, Status.SETTLED,
        "SYSTEM", "transfer-processor");

    String corrId = (String) row.get("key");
    jdbc.update("INSERT INTO ledger_entry(entry_id,account_id,debit,credit,correlation_id,transfer_id) VALUES (?,?,?,?,?,?)",
        UUID.randomUUID(), Long.parseLong((String) row.get("source")),
        (BigDecimal) row.get("amount"), java.math.BigDecimal.ZERO, corrId, transferId);
    jdbc.update("INSERT INTO ledger_entry(entry_id,account_id,debit,credit,correlation_id,transfer_id) VALUES (?,?,?,?,?,?)",
        UUID.randomUUID(), Long.parseLong((String) row.get("destination")),
        java.math.BigDecimal.ZERO, (BigDecimal) row.get("amount"), corrId, transferId);

    String receiptPayload = "{\"transferId\":\"" + transferId + "\",\"amount\":\"" + row.get("amount")
        + "\",\"currency\":\"" + row.get("currency")
        + "\",\"status\":\"SETTLED\",\"coreReference\":\"" + reference + "\"}";
    String receiptHash = sha256(receiptPayload);
    if (row.get("subject") != null) {
      jdbc.update("INSERT INTO transfer_receipt(receipt_id,transfer_id,subject,payload,sha256) VALUES (?,?,?,?,?) ON CONFLICT (transfer_id) DO NOTHING",
          UUID.randomUUID(), transferId, (String) row.get("subject"), receiptPayload, receiptHash);
      jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES (?,?,?,?)",
          UUID.randomUUID(), (String) row.get("subject"), "TRANSFER_SETTLED", receiptPayload);
    }
    audit.record("TRANSFER_SETTLED", "SYSTEM", "transfer-processor", "Transfer",
        transferId.toString(), "PROCESS", "SUCCESS", null, Map.of("coreReference", reference));
    return Map.of("transferId", transferId.toString(), "status", "SETTLED",
        "coreReference", reference);
  }

  private static String sha256(String input) {
    try {
      var d = java.security.MessageDigest.getInstance("SHA-256")
          .digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(d);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
