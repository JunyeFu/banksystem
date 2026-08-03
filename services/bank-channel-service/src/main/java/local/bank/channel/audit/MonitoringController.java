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
import java.time.OffsetDateTime;

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
    boolean coreHealthy = fineract.checkHealth();
    List<Map<String, String>> result = collectAlerts(coreHealthy);
    boolean serviceUnavailable = result.stream().anyMatch(item -> "P0".equals(item.get("severity")) || "P1".equals(item.get("severity")));
    Map<String, Object> body = new LinkedHashMap<>(); body.put("alerts", result); body.put("count", result.size());
    if (serviceUnavailable) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header("X-Alert", result.stream().anyMatch(item -> "EOD_FAILED".equals(item.get("code"))) ? "EOD_FAILED" : "SERVICE_ALERT_ACTIVE").body(body);
    return ResponseEntity.ok(body);
  }

  @GetMapping("/api/operations/v1/system-health")
  public Map<String,Object> systemHealth(){
    boolean coreHealthy=fineract.checkHealth(); List<Map<String,String>> source=collectAlerts(coreHealthy); List<Map<String,Object>> alerts=new ArrayList<>();
    for(Map<String,String> item:source){Map<String,Object> value=new LinkedHashMap<>();value.put("alertId",item.get("code"));value.put("code",item.get("code"));value.put("severity",publicSeverity(item.get("severity")));value.put("status","FIRING");value.put("serviceName",serviceFor(item.get("code")));value.put("message",messageFor(item.get("code")));value.put("triggeredAt",OffsetDateTime.now().toString());value.put("resolvedAt",null);value.put("labels",Map.of("source","runtime"));alerts.add(value);}
    List<Map<String,Object>> services=List.of(service("bank-channel-service",true),service("bank-channel-postgres",true),service("fineract-core",coreHealthy));
    boolean healthy=alerts.stream().noneMatch(item->"CRITICAL".equals(item.get("severity"))||"ERROR".equals(item.get("severity")));
    Map<String,Object> body=new LinkedHashMap<>();body.put("overallStatus",healthy?"HEALTHY":"DEGRADED");body.put("checkedAt",OffsetDateTime.now().toString());body.put("services",services);body.put("alerts",alerts);return body;
  }

  private List<Map<String,String>> collectAlerts(boolean coreHealthy) {
    List<Map<String, String>> result = new ArrayList<>();
    if (!coreHealthy) {
      result.add(alert("CORE_OUTAGE", "P1"));
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
    }

    Integer dlq = jdbc.queryForObject("SELECT count(*) FROM dead_letter_event", Integer.class);
    if (dlq != null && dlq > 0) {
      result.add(alert("DLQ_NON_EMPTY", "P1"));
    }

    Integer eodFailed = jdbc.queryForObject(
        "SELECT count(*) FROM eod_run WHERE status='FAILED' AND created_at > now() - interval '24 hours'",
        Integer.class);
    if (eodFailed != null && eodFailed > 0) {
      result.add(alert("EOD_FAILED", "P0"));
    }
    return result;
  }

  private static Map<String, String> alert(String code, String severity) {
    return Map.of("code", code, "severity", severity, "status", "FIRING");
  }
  private static Map<String,Object> service(String name,boolean healthy){return Map.of("serviceName",name,"status",healthy?"UP":"DOWN","latencyMs",0);}
  private static String publicSeverity(String severity){return switch(severity){case "P0"->"CRITICAL";case "P1"->"ERROR";case "P2"->"WARNING";default->"INFO";};}
  private static String serviceFor(String code){return code.startsWith("CORE")?"fineract-core":code.startsWith("OUTBOX")||code.startsWith("DLQ")?"bank-channel-service":"bank-channel-postgres";}
  private static String messageFor(String code){return switch(code){case "CORE_OUTAGE"->"核心银行服务健康检查失败";case "TRANSFER_PENDING"->"存在尚未完成的转账交易";case "OUTBOX_BACKLOG"->"事件发件箱存在待投递积压";case "RECONCILIATION_DIFFERENCE"->"对账运行发现账务差异";case "DLQ_NON_EMPTY"->"死信队列存在待处理事件";case "EOD_FAILED"->"过去 24 小时存在失败的日终运行";default->code;};}
}
