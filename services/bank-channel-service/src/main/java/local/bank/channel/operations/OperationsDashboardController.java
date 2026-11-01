package local.bank.channel.operations;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OperationsDashboardController {
  private final DashboardProjectionRepository repository;

  public OperationsDashboardController(DashboardProjectionRepository repository) {
    this.repository = repository;
  }

  @GetMapping("/api/operations/v1/dashboard")
  public Map<String, Object> dashboard() {
    var snapshot=repository.snapshot();
    int pendingApprovals=snapshot.pendingApprovals(), activePayments=snapshot.activePayments(), failedPayments=snapshot.failedPayments();
    int todayPaymentCount=snapshot.todayPaymentCount(), settledToday=snapshot.settledToday(), pendingAlerts=snapshot.pendingAlerts();
    int clearingExceptions=snapshot.clearingExceptions();
    String reconciliationStatus=snapshot.reconciliationStatus();
    BigDecimal todayPaymentAmount=snapshot.todayPaymentAmount();
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

}
