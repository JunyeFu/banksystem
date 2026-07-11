package local.bank.channel;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
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
  public Map<String, Object> run(@RequestParam(required = false) LocalDate businessDate) {
    LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
    List<String> steps = new ArrayList<>();
    String status = "COMPLETED";
    String recon = "MATCHED";
    String reason = "EOD completed successfully";

    // Step 1: Lock business date (record intent)
    steps.add("LOCK_DATE");

    // Step 2: Check core health
    if (!fineract.checkHealth()) {
      status = "FAILED"; recon = "BLOCKED"; reason = "Core health unavailable";
      return recordEod(date, status, recon, reason, steps);
    }
    steps.add("CORE_HEALTH_CHECK");

    // Step 3: Check pending transfers
    Integer pending = jdbc.queryForObject(
        "SELECT count(*) FROM transfer WHERE status IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING')",
        Integer.class);
    if (pending != null && pending > 0) {
      status = "FAILED"; recon = "DIFFERENCE"; reason = "Pending transfer exists: " + pending;
      return recordEod(date, status, recon, reason, steps);
    }
    steps.add("PENDING_CHECK");

    // Step 4: Channel-to-clearing reconciliation
    try {
      var result = reconciliationService.run("CHANNEL_TO_CLEARING");
      if (!"MATCHED".equals(result.get("status"))) {
        status = "FAILED"; recon = "DIFFERENCE"; reason = "Channel-to-clearing reconciliation failed";
        return recordEod(date, status, recon, reason, steps);
      }
    } catch (Exception e) {
      status = "FAILED"; recon = "BLOCKED"; reason = "Channel-to-clearing reconciliation error: " + e.getMessage();
      return recordEod(date, status, recon, reason, steps);
    }
    steps.add("CHANNEL_TO_CLEARING");

    // Step 5: Channel-to-core reconciliation
    try {
      var result = reconciliationService.run("CHANNEL_TO_CORE");
      if (!"MATCHED".equals(result.get("status"))) {
        status = "FAILED"; recon = "DIFFERENCE"; reason = "Channel-to-core reconciliation failed";
        return recordEod(date, status, recon, reason, steps);
      }
    } catch (Exception e) {
      status = "FAILED"; recon = "BLOCKED"; reason = "Channel-to-core reconciliation error: " + e.getMessage();
      return recordEod(date, status, recon, reason, steps);
    }
    steps.add("CHANNEL_TO_CORE");

    // Step 6: Core-to-general-ledger reconciliation (accounting balance)
    try {
      var result = reconciliationService.run("CORE_TO_GENERAL_LEDGER");
      if (!"MATCHED".equals(result.get("status"))) {
        status = "FAILED"; recon = "DIFFERENCE"; reason = "Core-to-general-ledger reconciliation failed";
        return recordEod(date, status, recon, reason, steps);
      }
    } catch (Exception e) {
      status = "FAILED"; recon = "BLOCKED"; reason = "Core-to-general-ledger reconciliation error: " + e.getMessage();
      return recordEod(date, status, recon, reason, steps);
    }
    steps.add("CORE_TO_GENERAL_LEDGER");

    // Step 7: Audit checkpoint
    auditService.record("EOD_CHECKPOINT", "SYSTEM", "eod-controller", "EodRun",
        date.toString(), "CHECKPOINT", "SUCCESS", null, Map.of("steps", steps));
    steps.add("AUDIT_CHECKPOINT");

    // Step 8: All steps passed - date can be advanced
    steps.add("READY_TO_ADVANCE");

    return recordEod(date, status, recon, reason, steps);
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
    return result;
  }

  @GetMapping("/internal/eod/latest")
  public Map<String, Object> latest() {
    var rows = jdbc.query(
        "SELECT run_id,business_date,status,reconciliation_status,reason FROM eod_run ORDER BY created_at DESC LIMIT 1",
        (rs, n) -> Map.<String, Object>of("runId", rs.getString(1), "businessDate", rs.getDate(2).toString(),
            "status", rs.getString(3), "reconciliationStatus", rs.getString(4), "reason", rs.getString(5)));
    return rows.isEmpty() ? Map.of("status", "NOT_STARTED") : rows.get(0);
  }
}
