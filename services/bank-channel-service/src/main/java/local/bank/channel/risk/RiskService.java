package local.bank.channel.risk;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class RiskService {
  private final JdbcTemplate jdbc;
  public RiskService(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @Transactional
  public Map<String,Object> evaluate(UUID transferId, BigDecimal amount, String subject){
    String decision=amount.compareTo(new BigDecimal("50000"))>0?"BLOCK":(amount.compareTo(new BigDecimal("10000"))>0?"REVIEW":"ALLOW");
    String reason="BLOCK".equals(decision)?"Amount exceeds hard limit":("REVIEW".equals(decision)?"Amount requires manual review":"Within deterministic sandbox threshold");
    UUID id=UUID.randomUUID(); jdbc.update("INSERT INTO risk_decision(decision_id,transfer_id,decision,reason,maker_subject) VALUES(?,?,?,?,?)",id,transferId,decision,reason,subject);
    return Map.of("decisionId",id.toString(),"transferId",transferId.toString(),"decision",decision,"reason",reason,"version",1);
  }
  @Transactional
  public Map<String,Object> approve(UUID decisionId, String checker, int version, String reason){
    if(reason==null||reason.isBlank()||reason.length()>240)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Approval reason is required");
    var rows=jdbc.query("SELECT decision,maker_subject,version FROM risk_decision WHERE decision_id=? FOR UPDATE",(rs,n)->Map.<String,Object>of("decision",rs.getString(1),"maker",rs.getString(2),"version",rs.getInt(3)),decisionId);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Risk decision not found");
    Map<String,Object> row=rows.get(0);if(!"REVIEW".equals(row.get("decision")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Only REVIEW decisions can be approved");if(row.get("maker").equals(checker))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker and checker must differ");if((Integer)row.get("version")!=version)throw new ResponseStatusException(HttpStatus.CONFLICT,"Risk decision version changed");
    jdbc.update("UPDATE risk_decision SET decision='ALLOW',checker_subject=?,approval_reason=?,version=version+1 WHERE decision_id=?",checker,reason,decisionId);return Map.of("decisionId",decisionId.toString(),"decision","ALLOW","version",version+1);
  }
}
