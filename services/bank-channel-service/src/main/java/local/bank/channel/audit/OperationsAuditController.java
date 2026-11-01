package local.bank.channel.audit;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OperationsAuditController {
  private final AuditRepository repository;
  private final AuditRecordHasher hasher;
  public OperationsAuditController(AuditRepository repository,AuditRecordHasher hasher){this.repository=repository;this.hasher=hasher;}

  @GetMapping("/api/operations/v1/audit/events")
  public List<Map<String,Object>> events(@RequestParam(required=false) String eventType,
      @RequestParam(required=false) String actorId,@RequestParam(required=false) String outcome,
      @RequestParam(required=false) String correlationId){
    String actor=actorId==null?"":actorId.trim(); String correlation=correlationId==null?"":correlationId.trim();
    return repository.events(eventType,actor,outcome,correlation);
  }

  @GetMapping("/api/operations/v1/audit/verify")
  public Map<String,Object> verify(){
    List<AuditRecordHasher.AuditRecord> rows=repository.records();
    String previous=null; String broken=null;
    for(var row:rows){String expected=row.hashVersion()==1?AuditRecordHasher.legacyHash(row):hasher.hash(row);if(!Objects.equals(previous,row.previousHash())||!Objects.equals(expected,row.recordHash())){broken=row.id().toString();break;}previous=row.recordHash();}
    Map<String,Object> result=new LinkedHashMap<>();result.put("verified",broken==null);result.put("totalEvents",rows.size());result.put("brokenAtEventId",broken);result.put("lastVerifiedHash",previous);return result;
  }
}
