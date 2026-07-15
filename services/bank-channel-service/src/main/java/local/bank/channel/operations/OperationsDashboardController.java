package local.bank.channel.operations;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OperationsDashboardController {
  private static final String ACTIVE_STATUSES =
      "'CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','REVERSAL_PENDING'";
  private static final String FAILED_STATUSES = "'FAILED','TIMED_OUT','RETURNED','REVERSED'";

  private final JdbcTemplate jdbc;

  public OperationsDashboardController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/api/operations/v1/dashboard")
  public Map<String, Object> dashboard() {
    int pendingApprovals = count("SELECT count(*) FROM loan_approval WHERE status='PENDING'");
    int activePayments = count("SELECT count(*) FROM transfer_order WHERE status IN (" + ACTIVE_STATUSES + ")");
    int failedPayments = count("SELECT count(*) FROM transfer_order WHERE status IN (" + FAILED_STATUSES + ")");
    int todayPaymentCount = count("SELECT count(*) FROM transfer_order WHERE created_at >= CURRENT_DATE");
    int settledToday = count("SELECT count(*) FROM transfer_order WHERE status='SETTLED' AND created_at >= CURRENT_DATE");
    int pendingAlerts = count("SELECT count(*) FROM outbox_event WHERE status='PENDING'")
        + count("SELECT count(*) FROM dead_letter_event")
        + count("SELECT count(*) FROM eod_run WHERE status='FAILED' AND created_at > now() - interval '24 hours'");
    int clearingExceptions = count("SELECT count(*) FROM clearing_payment WHERE status IN ('REJECTED','FAILED','TIMED_OUT')");
    String reconciliationStatus = latestReconciliationStatus();
    BigDecimal todayPaymentAmount = jdbc.queryForObject(
        "SELECT COALESCE(sum(amount),0) FROM transfer_order WHERE created_at >= CURRENT_DATE",
        BigDecimal.class);
    double successRate = todayPaymentCount == 0 ? 100.0
        : BigDecimal.valueOf(settledToday * 100.0 / todayPaymentCount).setScale(2, RoundingMode.HALF_UP).doubleValue();

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("generatedAt", OffsetDateTime.now().toString());
    result.put("pendingApprovals", pendingApprovals);
    result.put("clearingStatus", clearingExceptions == 0 ? "NORMAL" : "ATTENTION");
    result.put("reconciliationStatus", reconciliationStatus);
    result.put("activePayments", activePayments);
    result.put("failedPayments", failedPayments);
    result.put("systemHealth", pendingAlerts == 0 && !"DIFFERENCE".equals(reconciliationStatus) ? "HEALTHY" : "DEGRADED");
    result.put("todayPaymentAmount", (todayPaymentAmount == null ? BigDecimal.ZERO : todayPaymentAmount).toPlainString());
    result.put("todayPaymentCount", todayPaymentCount);
    result.put("successRate", successRate);
    result.put("pendingAlerts", pendingAlerts);
    return result;
  }

  private int count(String sql) {
    Integer value = jdbc.queryForObject(sql, Integer.class);
    return value == null ? 0 : value;
  }

  private String latestReconciliationStatus() {
    var statuses = jdbc.query(
        "SELECT status FROM reconciliation_run ORDER BY created_at DESC LIMIT 1",
        (rs, rowNumber) -> rs.getString(1));
    return statuses.isEmpty() ? "NOT_RUN" : statuses.get(0);
  }
}
