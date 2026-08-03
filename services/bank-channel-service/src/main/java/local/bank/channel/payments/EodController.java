package local.bank.channel.payments;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.audit.AuditService;
import local.bank.channel.FineractAdapter;
import local.bank.channel.reconciliation.ReconciliationService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
public class EodController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  private final ReconciliationService reconciliationService;
  private final AuditService auditService;

  public EodController(JdbcTemplate jdbc, FineractAdapter fineract,
                       ReconciliationService reconciliationService, AuditService auditService) {
    this.jdbc = jdbc;
    this.fineract = fineract;
    this.reconciliationService = reconciliationService;
    this.auditService = auditService;
  }

  @PostMapping("/internal/eod/run")
  @Transactional
  public Map<String, Object> runInternal(@RequestParam(required = false) LocalDate businessDate) {
    return execute(businessDate);
  }

  @PostMapping("/api/operations/v1/eod/run")
  @Transactional
  public Map<String, Object> runPublic(@RequestHeader("Idempotency-Key") String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.length() < 16 || idempotencyKey.length() > 128)
      throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Idempotency-Key must contain 16 to 128 characters");
    jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext(?))", Object.class, "eod:" + idempotencyKey);
    var existing = jdbc.query("SELECT run_id,business_date,status,reconciliation_status,reason,created_at,updated_at FROM eod_run WHERE idempotency_key=?",
        (rs,n)->eodRow(rs.getString(1),rs.getDate(2).toString(),rs.getString(3),rs.getString(4),rs.getString(5),rs.getTimestamp(6).toInstant().toString(),rs.getTimestamp(7).toInstant().toString()), idempotencyKey);
    if (!existing.isEmpty()) return existing.get(0);
    Map<String,Object> result=execute(null);
    jdbc.update("UPDATE eod_run SET idempotency_key=? WHERE run_id=?", idempotencyKey, UUID.fromString(String.valueOf(result.get("runId"))));
    return result;
  }

  private Map<String, Object> execute(LocalDate businessDate) {
    jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext('eod-run'))", Object.class);
    LocalDate date = businessDate == null ? fineract.businessDate() : businessDate;
    List<String> steps = new ArrayList<>();
    String status = "COMPLETED";
    String recon = "MATCHED";
    String reason = "EOD completed successfully";
    LocalDate newDate = null;

    step(steps, "LOCK_DATE");

    try {
      if (!fineract.checkHealth())
        return failEod(date, "BLOCKED", "Core health unavailable", steps,
            "EOD_HEALTH_CHECK_FAILED", Map.of("afterStep", "LOCK_DATE"));
      step(steps, "CORE_HEALTH_CHECK");

      Integer pending = jdbc.queryForObject(
          "SELECT count(*) FROM transfer_order WHERE status IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING')",
          Integer.class);
      if (pending != null && pending > 0)
        return failEod(date, "DIFFERENCE", "Pending transfer exists: " + pending, steps,
            "EOD_PENDING_TRANSFER_FAILED", Map.of("pendingCount", pending, "afterStep", "CORE_HEALTH_CHECK"));
      step(steps, "PENDING_CHECK");

      runRecon(steps, "CHANNEL_TO_CLEARING");
      runRecon(steps, "CHANNEL_TO_CORE");
      runRecon(steps, "CORE_TO_GENERAL_LEDGER");

      safeRunJob(steps, "FINERACT_COB_BATCH", () -> fineract.runCobBatch());
      safeRunJob(steps, "FIX_APPLY_ANNUAL_FEE", () -> fineract.applyAnnualFeeForSavings());
      safeRunJob(steps, "FIX_POST_INTEREST_SAVINGS", () -> fineract.postInterestOnSavings());
      safeRunJob(steps, "FIX_PAY_DUE_SAVINGS_CHARGES", () -> fineract.payDueSavingsCharges());
      safeRunJob(steps, "FIX_LOAN_ARREARS_AGEING", () -> fineract.updateLoanArrearsAgeing());
      safeRunJob(steps, "FIX_PENALTY_OVERDUE_LOANS", () -> fineract.applyPenaltyToOverdueLoans());
      safeRunJob(steps, "FIX_TRANSFERS_INTEREST_TO_SAVINGS", () -> fineract.transferInterestToSavings());
      safeRunJob(steps, "FIX_ACCOUNTING_RUNNING_BALANCES", () -> fineract.updateAccountingRunningBalances());
      steps.add("INTEREST_FEES_OVERDUE");

      runRecon(steps, "CORE_TO_GENERAL_LEDGER"); // post-jobs accounting balance check
      auditService.record("EOD_CHECKPOINT", "SYSTEM", "eod-controller", "EodRun",
          date.toString(), "CHECKPOINT", "SUCCESS", null, Map.of("steps", steps));
      step(steps, "AUDIT_CHECKPOINT");

      newDate = date.plusDays(1);
      try {
        fineract.advanceBusinessDate(newDate);
        step(steps, "ADVANCE_DATE");
      } catch (Exception e) {
        return failEod(date, "BLOCKED", "Business date advance failed: " + e.getMessage(), steps,
            "EOD_DATE_ADVANCE_FAILED", Map.of("targetDate", newDate.toString(), "afterStep", "AUDIT_CHECKPOINT"));
      }
      step(steps, "UNLOCK_NEXT_BUSINESS_DAY");
    } catch (EodReconciliationFailed e) {
      return failEod(date, e.recon, e.getMessage(), steps, "EOD_RECONCILIATION_FAILED",
          Map.of("reconciliationType", e.type, "afterStep", e.lastStep));
    }

    Map<String, Object> result = recordEod(date, status, recon, reason, steps);
    result.put("newDate", newDate != null ? newDate.toString() : null);
    return result;
  }

  private void runRecon(List<String> steps, String type) {
    try {
      var result = reconciliationService.run(type);
      String reconResult = String.valueOf(result == null ? "" : result.get("status"));
      if (!"MATCHED".equals(reconResult))
        throw new EodReconciliationFailed(type, "DIFFERENCE",
            type + " reconciliation failed: " + reconResult, lastStep(steps));
      step(steps, type);
    } catch (EodReconciliationFailed e) { throw e; }
    catch (Exception e) {
      throw new EodReconciliationFailed(type, "BLOCKED",
          type + " reconciliation error: " + e.getMessage(), lastStep(steps));
    }
  }

  private void safeRunJob(List<String> steps, String stepName, Runnable job) {
    try {
      job.run();
      step(steps, stepName);
    } catch (Exception e) {
      throw new EodReconciliationFailed(stepName, "BLOCKED",
          stepName + " failed: " + e.getMessage(), lastStep(steps));
    }
  }

  private static void step(List<String> steps, String name) { steps.add(name); }

  private static String lastStep(List<String> steps) {
    return steps.isEmpty() ? "(none)" : steps.get(steps.size() - 1);
  }

  private Map<String, Object> failEod(LocalDate date, String recon, String reason, List<String> steps,
      String auditEventType, Map<String, Object> auditMetadata) {
    Map<String, Object> meta = new LinkedHashMap<>(auditMetadata);
    meta.put("stepsCompleted", steps);
    auditService.record(auditEventType, "SYSTEM", "eod-controller", "EodRun",
        date.toString(), "EOD", "FAILED", null, meta);
    return recordEod(date, "FAILED", recon, reason, steps);
  }

  private Map<String, Object> recordEod(LocalDate date, String status, String recon, String reason, List<String> steps) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO eod_run(run_id,business_date,status,reconciliation_status,reason) VALUES(?,?,?,?,?)",
        id, date, status, recon, reason);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("runId", id.toString());
    result.put("businessDate", date.toString());
    result.put("status", status);
    result.put("reconciliationStatus", recon);
    result.put("reason", reason);
    result.put("stepsCompleted", steps);
    String now = java.time.OffsetDateTime.now().toString();
    result.put("startedAt", now);
    result.put("completedAt", now);
    return result;
  }

  @GetMapping({"/internal/eod/latest", "/api/operations/v1/eod/latest"})
  public Map<String, Object> latest() {
    var rows = jdbc.query(
        "SELECT run_id,business_date,status,reconciliation_status,reason,created_at,updated_at FROM eod_run ORDER BY created_at DESC LIMIT 1",
        (rs, n) -> eodRow(rs.getString(1), rs.getDate(2).toString(), rs.getString(3), rs.getString(4), rs.getString(5), rs.getTimestamp(6).toInstant().toString(), rs.getTimestamp(7).toInstant().toString()));
    return rows.isEmpty() ? Map.of("status", "NOT_STARTED") : rows.get(0);
  }

  private static Map<String,Object> eodRow(String runId,String businessDate,String status,String reconciliationStatus,String reason,String startedAt,String completedAt){
    Map<String,Object> item=new LinkedHashMap<>();item.put("runId",runId);item.put("businessDate",businessDate);item.put("status",status);item.put("reconciliationStatus",reconciliationStatus);item.put("reason",reason);item.put("stepsCompleted",List.of());item.put("startedAt",startedAt);item.put("completedAt",completedAt);return item;
  }

  private static final class EodReconciliationFailed extends RuntimeException {
    final String type;
    final String recon;
    final String lastStep;
    EodReconciliationFailed(String type, String recon, String message, String lastStep) {
      super(message);
      this.type = type;
      this.recon = recon;
      this.lastStep = lastStep;
    }
  }
}
