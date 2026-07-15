package local.bank.channel.payments;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import local.bank.channel.audit.AuditService;
import local.bank.channel.FineractAdapter;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;

@RestController
public class TransferReversalController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;

  public TransferReversalController(JdbcTemplate jdbc, FineractAdapter fineract,
                                   AuditService audit, TransferStateMachine stateMachine) {
    this.jdbc = jdbc;
    this.fineract = fineract;
    this.audit = audit;
    this.stateMachine = stateMachine;
  }

  @GetMapping("/api/operations/v1/approvals")
  public List<Map<String, Object>> approvals(@RequestParam(required = false) String status) {
    String filter = status == null || status.isBlank() ? "" : " WHERE r.status=?";
    String sql = "SELECT r.reversal_id,r.transfer_id,r.maker_subject,r.checker_subject,r.status,r.reason,r.version,r.core_reference,r.created_at,r.updated_at,t.amount,t.currency,t.source_account_id,t.destination_account_id FROM transfer_reversal r JOIN transfer_order t ON t.transfer_id=r.transfer_id" + filter + " ORDER BY r.created_at DESC";
    Object[] args = filter.isEmpty() ? new Object[0] : new Object[]{status};
    return jdbc.query(sql, (rs, n) -> {
      Map<String, Object> item = new LinkedHashMap<>();
      String reversalId = rs.getObject(1, UUID.class).toString();
      item.put("approvalId", reversalId); item.put("reversalId", reversalId); item.put("transferId", rs.getObject(2, UUID.class).toString());
      item.put("creator", rs.getString(3)); item.put("checker", rs.getString(4)); item.put("status", rs.getString(5)); item.put("reason", rs.getString(6)); item.put("version", rs.getInt(7)); item.put("coreReference", rs.getString(8));
      item.put("createdAt", rs.getObject(9, OffsetDateTime.class).toString()); item.put("updatedAt", rs.getObject(10, OffsetDateTime.class).toString());
      item.put("amount", rs.getBigDecimal(11).toPlainString()); item.put("currency", rs.getString(12)); item.put("sourceAccountId", rs.getString(13)); item.put("destinationAccountId", rs.getString(14)); return item;
    }, args);
  }

  @PostMapping("/api/operations/v1/transfers/{transferId}/reversal")
  public Map<String, Object> request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID transferId, @RequestBody Reason reason) {
    if (reason.reason() == null || reason.reason().isBlank())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reason is required");
    var rows = jdbc.query("SELECT status FROM transfer_order WHERE transfer_id=?", (rs, n) -> rs.getString(1), transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    Status current = Status.of(rows.get(0));
    if (current != Status.SETTLED)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Only settled transfers can be reversed");

    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO transfer_reversal(reversal_id,transfer_id,maker_subject,status,reason) VALUES(?,?,?,?,?)",
        id, transferId, jwt.getSubject(), "PENDING", reason.reason());
    stateMachine.transitionState(transferId, Status.SETTLED, Status.REVERSAL_PENDING,
        "USER", jwt.getSubject(), reason.reason(), null);
    audit.record("TRANSFER_REVERSAL_REQUESTED", "USER", jwt.getSubject(), "Transfer",
        transferId.toString(), "REVERSE", "SUCCESS", null, Map.of("reason", reason.reason()));
    return Map.of("reversalId", id.toString(), "status", "PENDING", "version", 1);
  }

  @PostMapping("/api/operations/v1/transfers/reversals/{reversalId}/approve")
  public Map<String, Object> approve(
      @AuthenticationPrincipal Jwt jwt, @PathVariable UUID reversalId,
      @RequestParam int version, @RequestBody Reason reason,
      @RequestHeader("Idempotency-Key") String key) {
    if (reason.reason() == null || reason.reason().isBlank())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reason is required");

    var rev = jdbc.query("SELECT transfer_id,maker_subject,status,version,core_reference FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",
        (rs, n) -> { Map<String,Object> item=new LinkedHashMap<>(); item.put("transfer",rs.getObject(1)); item.put("maker",rs.getString(2)); item.put("status",rs.getString(3)); item.put("version",rs.getInt(4)); item.put("coreReference",rs.getString(5)); return item; },
        reversalId);
    if (rev.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reversal not found");
    var r = rev.get(0);
    if ("APPROVED".equals(r.get("status")) && (Integer) r.get("version") == version + 1)
      return actionResult(reversalId, (UUID) r.get("transfer"), "APPROVED", version + 1, (String) r.get("coreReference"));
    if (r.get("maker").equals(jwt.getSubject()))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Maker cannot check own reversal");
    if (!"PENDING".equals(r.get("status")) || (Integer) r.get("version") != version)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Reversal version/state changed");

    UUID transferId = (UUID) r.get("transfer");
    var rows = jdbc.query("SELECT source_account_id,destination_account_id,amount,currency,status FROM transfer_order WHERE transfer_id=?",
        (rs, n) -> Map.<String, Object>of("source", rs.getString(1), "destination", rs.getString(2),
            "amount", rs.getBigDecimal(3), "currency", rs.getString(4), "status", rs.getString(5)), transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    var t = rows.get(0);
    Status current = Status.of((String) t.get("status"));
    if (current != Status.REVERSAL_PENDING)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Transfer is not pending reversal");

    Map<String, Object> core = fineract.accountTransfer(
        Long.parseLong((String) t.get("destination")),
        Long.parseLong((String) t.get("source")),
        (BigDecimal) t.get("amount"),
        (String) t.get("currency"),
        key);
    String ref = String.valueOf(core.getOrDefault("resourceId", core.getOrDefault("id", "")));

    jdbc.update("UPDATE transfer_reversal SET checker_subject=?,status='APPROVED',version=version+1,core_reference=?,updated_at=now() WHERE reversal_id=?",
        jwt.getSubject(), ref, reversalId);
    stateMachine.transitionState(transferId, Status.REVERSAL_PENDING, Status.REVERSED,
        "USER", jwt.getSubject(), reason.reason(), Map.of("coreReference", ref));
    audit.record("TRANSFER_REVERSED", "USER", jwt.getSubject(), "Transfer",
        transferId.toString(), "REVERSE", "SUCCESS", null, Map.of("coreReference", ref));
    return actionResult(reversalId, transferId, "APPROVED", version + 1, ref);
  }

  @PostMapping("/api/operations/v1/transfers/reversals/{reversalId}/reject")
  public Map<String, Object> reject(
      @AuthenticationPrincipal Jwt jwt, @PathVariable UUID reversalId,
      @RequestParam int version, @RequestBody Reason reason,
      @RequestHeader("Idempotency-Key") String key) {
    if (reason.reason() == null || reason.reason().isBlank() || reason.reason().length() > 240)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reason is required and must not exceed 240 characters");
    var rows = jdbc.query("SELECT transfer_id,maker_subject,status,version FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",
        (rs, n) -> Map.<String, Object>of("transfer", rs.getObject(1), "maker", rs.getString(2), "status", rs.getString(3), "version", rs.getInt(4)), reversalId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reversal not found");
    var row = rows.get(0); UUID transferId = (UUID) row.get("transfer");
    if ("REJECTED".equals(row.get("status")) && (Integer) row.get("version") == version + 1)
      return actionResult(reversalId, transferId, "REJECTED", version + 1, null);
    if (row.get("maker").equals(jwt.getSubject())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Maker cannot check own reversal");
    if (!"PENDING".equals(row.get("status")) || (Integer) row.get("version") != version)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Reversal version/state changed");
    jdbc.update("UPDATE transfer_reversal SET checker_subject=?,status='REJECTED',version=version+1,updated_at=now() WHERE reversal_id=?", jwt.getSubject(), reversalId);
    stateMachine.transitionState(transferId, Status.REVERSAL_PENDING, Status.SETTLED, "USER", jwt.getSubject(), reason.reason(), Map.of("approval", "REJECTED"));
    audit.record("TRANSFER_REVERSAL_REJECTED", "USER", jwt.getSubject(), "Transfer", transferId.toString(), "REVERSE", "REJECTED", null, Map.of("reason", reason.reason(), "idempotencyKeyPresent", !key.isBlank()));
    return actionResult(reversalId, transferId, "REJECTED", version + 1, null);
  }

  private static Map<String, Object> actionResult(UUID reversalId, UUID transferId, String status, int version, String coreReference) {
    Map<String, Object> result = new LinkedHashMap<>(); result.put("reversalId", reversalId.toString()); result.put("transferId", transferId.toString()); result.put("status", status); result.put("version", version); result.put("coreReference", coreReference); return result;
  }

  public record Reason(String reason) {}
}
