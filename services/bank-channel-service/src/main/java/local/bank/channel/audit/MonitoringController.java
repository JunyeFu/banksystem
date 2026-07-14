package local.bank.channel.audit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAdapter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MonitoringController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;

  public MonitoringController(JdbcTemplate jdbc, FineractAdapter fineract) {
    this.jdbc = jdbc;
    this.fineract = fineract;
  }

  @GetMapping("/internal/monitoring/alerts")
  public ResponseEntity<Map<String, Object>> alerts() {
    List<Map<String, String>> result = new ArrayList<>();
    boolean serviceUnavailable = false;

    if (!fineract.checkHealth()) {
      result.add(alert("CORE_OUTAGE", "P1"));
      serviceUnavailable = true;
    }

    Integer pending = jdbc.queryForObject(
        "SELECT count(*) FROM transfer_order WHERE status IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING')",
        Integer.class);
    if (pending != null && pending > 0)
      result.add(alert("TRANSFER_PENDING", "P2"));

    Integer undelivered = jdbc.queryForObject(
        "SELECT count(*) FROM outbox_event WHERE status = 'PENDING'", Integer.class);
    if (undelivered != null && undelivered > 0)
      result.add(alert("OUTBOX_BACKLOG", "P2"));

    Integer differences = jdbc.queryForObject(
        "SELECT count(*) FROM reconciliation_run WHERE status='DIFFERENCE'", Integer.class);
    if (differences != null && differences > 0) {
      result.add(alert("RECONCILIATION_DIFFERENCE", "P1"));
      serviceUnavailable = true;
    }

    Integer dlq = jdbc.queryForObject("SELECT count(*) FROM dead_letter_event", Integer.class);
    if (dlq != null && dlq > 0) {
      result.add(alert("DLQ_NON_EMPTY", "P1"));
      serviceUnavailable = true;
    }

    Integer eodFailed = jdbc.queryForObject(
        "SELECT count(*) FROM eod_run WHERE status='FAILED' AND created_at > now() - interval '24 hours'",
        Integer.class);
    if (eodFailed != null && eodFailed > 0) {
      result.add(alert("EOD_FAILED", "P0"));
      serviceUnavailable = true;
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("alerts", result);
    body.put("count", result.size());

    if (serviceUnavailable) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .header("X-Alert", eodFailed != null && eodFailed > 0 ? "EOD_FAILED" : "SERVICE_ALERT_ACTIVE")
          .body(body);
    }
    return ResponseEntity.ok(body);
  }

  private static Map<String, String> alert(String code, String severity) {
    return Map.of("code", code, "severity", severity, "status", "FIRING");
  }
}
