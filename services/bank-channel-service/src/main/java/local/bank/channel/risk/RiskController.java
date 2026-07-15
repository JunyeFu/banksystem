package local.bank.channel.risk;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class RiskController {
  private final RiskService service;
  private final JdbcTemplate jdbc;
  public RiskController(RiskService service, JdbcTemplate jdbc){this.service=service;this.jdbc=jdbc;}
  @GetMapping("/api/operations/v1/risk/alerts")
  public List<Map<String,Object>> alerts(@RequestParam(required=false) String status){
    return decisions().stream().map(RiskController::toAlert).filter(item -> status==null || status.isBlank() || status.equals(item.get("status"))).toList();
  }
  @GetMapping("/api/operations/v1/risk/cases")
  public List<Map<String,Object>> cases(@RequestParam(required=false) String status){
    return decisions().stream().map(RiskController::toCase).filter(item -> status==null || status.isBlank() || status.equals(item.get("status"))).toList();
  }
  @PostMapping("/api/operations/v1/risk/evaluate")
  public Map<String,Object> evaluate(@AuthenticationPrincipal Jwt jwt,@RequestBody Request request){return service.evaluate(UUID.fromString(request.transferId()),request.amount(),jwt.getSubject());}
  @PostMapping("/api/operations/v1/risk/{decisionId}/approve")
  public Map<String,Object> approve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID decisionId,@RequestParam int version,@RequestParam String reason){return service.approve(decisionId,jwt.getSubject(),version,reason);}
  public record Request(String transferId,BigDecimal amount){}

  private List<DecisionRow> decisions(){
    return jdbc.query("SELECT d.decision_id,d.transfer_id,COALESCE(t.subject,d.maker_subject),d.decision,d.reason,d.maker_subject,d.checker_subject,d.version,d.created_at,d.updated_at FROM risk_decision d LEFT JOIN transfer_order t ON t.transfer_id=d.transfer_id ORDER BY d.created_at DESC",
        (rs,n)->new DecisionRow(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getInt(8),rs.getObject(9,OffsetDateTime.class),rs.getObject(10,OffsetDateTime.class)));
  }
  static Map<String,Object> toAlert(DecisionRow row){
    boolean resolved="ALLOW".equals(row.decision()) && row.checker()!=null;
    Map<String,Object> item=new LinkedHashMap<>();
    item.put("alertId",row.id().toString());item.put("severity",severity(row.decision()));item.put("status",resolved?"RESOLVED":"ACTIVE");
    item.put("ruleName",rule(row.decision()));item.put("entityType","TRANSFER");item.put("entityId",row.transferId().toString());item.put("description",row.reason());item.put("score",score(row.decision()));item.put("triggeredAt",row.createdAt().toString());item.put("acknowledgedBy",row.checker());item.put("resolvedAt",resolved?row.updatedAt().toString():null);return item;
  }
  static Map<String,Object> toCase(DecisionRow row){
    Map<String,Object> item=new LinkedHashMap<>();
    item.put("caseId",row.id().toString());item.put("transferId",row.transferId().toString());item.put("customerSubject",row.customer());item.put("decision",row.decision());item.put("status",caseStatus(row.decision()));item.put("score",score(row.decision()));item.put("triggeredRules",List.of(rule(row.decision())));item.put("maker",row.maker());item.put("checker",row.checker());item.put("version",row.version());item.put("createdAt",row.createdAt().toString());item.put("reviewedAt",row.checker()==null?null:row.updatedAt().toString());return item;
  }
  private static String severity(String decision){return "BLOCK".equals(decision)?"CRITICAL":"REVIEW".equals(decision)?"HIGH":"LOW";}
  private static int score(String decision){return "BLOCK".equals(decision)?95:"REVIEW".equals(decision)?72:20;}
  private static String rule(String decision){return "BLOCK".equals(decision)?"大额交易硬限额":"REVIEW".equals(decision)?"人工复核阈值":"标准交易规则";}
  private static String caseStatus(String decision){return "REVIEW".equals(decision)?"UNDER_REVIEW":"BLOCK".equals(decision)?"OPEN":"APPROVED";}
  record DecisionRow(UUID id,UUID transferId,String customer,String decision,String reason,String maker,String checker,int version,OffsetDateTime createdAt,OffsetDateTime updatedAt){}
}
