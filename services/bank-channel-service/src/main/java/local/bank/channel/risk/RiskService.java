package local.bank.channel.risk;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class RiskService {
  private final RiskRepository repository;
  public RiskService(RiskRepository repository){this.repository=repository;}
  @Transactional
  public Map<String,Object> evaluate(UUID transferId, BigDecimal amount, String subject){
    var existing=repository.latest(transferId);
    if(!existing.isEmpty())return existing.get(0);
    String decision=amount.compareTo(new BigDecimal("50000"))>0?"BLOCK":(amount.compareTo(new BigDecimal("10000"))>0?"REVIEW":"ALLOW");
    String reason="BLOCK".equals(decision)?"Amount exceeds hard limit":("REVIEW".equals(decision)?"Amount requires manual review":"Within deterministic sandbox threshold");
    UUID id=UUID.randomUUID(); repository.create(id,transferId,decision,reason,subject);
    return Map.of("decisionId",id.toString(),"transferId",transferId.toString(),"decision",decision,"reason",reason,"version",1);
  }
  @Transactional
  public Approval approve(UUID decisionId, String checker, int version, String reason){
    if(reason==null||reason.isBlank()||reason.length()>240)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Approval reason is required");
    var rows=repository.lock(decisionId);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Risk decision not found");
    Map<String,Object> row=rows.get(0);if(!"REVIEW".equals(row.get("decision")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Only REVIEW decisions can be approved");if(row.get("maker").equals(checker))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker and checker must differ");if((Integer)row.get("version")!=version)throw new ResponseStatusException(HttpStatus.CONFLICT,"Risk decision version changed");
    UUID transferId=(UUID)row.get("transferId");
    repository.approve(decisionId,checker,reason);
    return new Approval(decisionId,transferId,version+1);
  }
  public record Approval(UUID decisionId,UUID transferId,int version) { }
}
