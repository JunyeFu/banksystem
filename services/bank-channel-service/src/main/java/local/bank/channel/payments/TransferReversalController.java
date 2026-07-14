package local.bank.channel.payments;

import java.math.BigDecimal;
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

    var rev = jdbc.query("SELECT transfer_id,maker_subject,status,version FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",
        (rs, n) -> Map.<String, Object>of("transfer", rs.getObject(1), "maker", rs.getString(2), "status", rs.getString(3), "version", rs.getInt(4)),
        reversalId);
    if (rev.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reversal not found");
    var r = rev.get(0);
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

    jdbc.update("UPDATE transfer_reversal SET checker_subject=?,status='APPROVED',version=version+1,core_reference=? WHERE reversal_id=?",
        jwt.getSubject(), ref, reversalId);
    stateMachine.transitionState(transferId, Status.REVERSAL_PENDING, Status.REVERSED,
        "USER", jwt.getSubject(), reason.reason(), Map.of("coreReference", ref));
    audit.record("TRANSFER_REVERSED", "USER", jwt.getSubject(), "Transfer",
        transferId.toString(), "REVERSE", "SUCCESS", null, Map.of("coreReference", ref));
    return Map.of("reversalId", reversalId.toString(), "transferId", transferId.toString(),
        "status", "APPROVED", "coreReference", ref, "version", version + 1);
  }

  public record Reason(String reason) {}
}
