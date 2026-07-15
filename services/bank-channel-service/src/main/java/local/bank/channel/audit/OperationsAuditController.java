package local.bank.channel.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OperationsAuditController {
  private final JdbcTemplate jdbc;
  public OperationsAuditController(JdbcTemplate jdbc){this.jdbc=jdbc;}

  @GetMapping("/api/operations/v1/audit/events")
  public List<Map<String,Object>> events(@RequestParam(required=false) String eventType,
      @RequestParam(required=false) String actorId,@RequestParam(required=false) String outcome,
      @RequestParam(required=false) String correlationId){
    String actor=actorId==null?"":actorId.trim(); String correlation=correlationId==null?"":correlationId.trim();
    return jdbc.query("""
        SELECT id,event_type,actor_id,action,resource_type,resource_id,outcome,record_hash,previous_hash,correlation_id,created_at
        FROM security_audit_event
        WHERE (? IS NULL OR event_type=?) AND (?='' OR lower(actor_id) LIKE lower('%'||?||'%'))
          AND (? IS NULL OR outcome=?) AND (?='' OR correlation_id=?)
        ORDER BY created_at DESC,id DESC LIMIT 500
        """,(rs,n)->{Map<String,Object> item=new LinkedHashMap<>();item.put("eventId",rs.getString(1));item.put("eventType",rs.getString(2));item.put("actorId",rs.getString(3));item.put("action",rs.getString(4));item.put("resourceType",rs.getString(5));item.put("resourceId",rs.getString(6));item.put("outcome",rs.getString(7));item.put("recordHash",rs.getString(8));item.put("previousHash",rs.getString(9));item.put("correlationId",rs.getString(10));item.put("timestamp",rs.getObject(11,OffsetDateTime.class).toString());return item;},
        eventType,eventType,actor,actor,outcome,outcome,correlation,correlation);
  }

  @GetMapping("/api/operations/v1/audit/verify")
  public Map<String,Object> verify(){
    List<Row> rows=jdbc.query("SELECT id,event_type,actor_id,resource_id,action,outcome,previous_hash,record_hash FROM security_audit_event ORDER BY created_at,id",
        (rs,n)->new Row(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8)));
    String previous=null; String broken=null;
    for(Row row:rows){String expected=sha256(previous+"|"+row.eventType()+"|"+row.actorId()+"|"+row.resourceId()+"|"+row.action()+"|"+row.outcome());if(!Objects.equals(previous,row.previousHash())||!Objects.equals(expected,row.recordHash())){broken=row.id();break;}previous=row.recordHash();}
    Map<String,Object> result=new LinkedHashMap<>();result.put("verified",broken==null);result.put("totalEvents",rows.size());result.put("brokenAtEventId",broken);result.put("lastVerifiedHash",previous);return result;
  }
  private static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
  private record Row(String id,String eventType,String actorId,String resourceId,String action,String outcome,String previousHash,String recordHash){}
}
