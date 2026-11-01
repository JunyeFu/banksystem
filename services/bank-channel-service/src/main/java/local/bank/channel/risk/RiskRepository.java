package local.bank.channel.risk;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RiskRepository {
  private final JdbcTemplate jdbc;
  public RiskRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public List<Map<String,Object>> latest(UUID transferId) {
    return jdbc.query("SELECT decision_id,decision,reason,version FROM risk_decision WHERE transfer_id=? ORDER BY created_at DESC LIMIT 1",
        (rs,n)->Map.<String,Object>of("decisionId",rs.getObject(1).toString(),"transferId",transferId.toString(),"decision",rs.getString(2),"reason",rs.getString(3),"version",rs.getInt(4)),transferId);
  }
  public void create(UUID id, UUID transferId, String decision, String reason, String subject) {
    jdbc.update("INSERT INTO risk_decision(decision_id,transfer_id,decision,reason,maker_subject) VALUES(?,?,?,?,?)",id,transferId,decision,reason,subject);
  }
  public List<Map<String,Object>> lock(UUID decisionId) {
    return jdbc.query("SELECT decision,maker_subject,version,transfer_id FROM risk_decision WHERE decision_id=? FOR UPDATE",
        (rs,n)->Map.<String,Object>of("decision",rs.getString(1),"maker",rs.getString(2),"version",rs.getInt(3),"transferId",rs.getObject(4,UUID.class)),decisionId);
  }
  public void approve(UUID decisionId, String checker, String reason) {
    jdbc.update("UPDATE risk_decision SET decision='ALLOW',checker_subject=?,approval_reason=?,version=version+1,updated_at=now() WHERE decision_id=?",checker,reason,decisionId);
  }
  public List<DecisionRow> decisions() {
    return jdbc.query("SELECT d.decision_id,d.transfer_id,COALESCE(t.subject,d.maker_subject),d.decision,d.reason,d.maker_subject,d.checker_subject,d.version,d.created_at,d.updated_at FROM risk_decision d LEFT JOIN transfer_order t ON t.transfer_id=d.transfer_id ORDER BY d.created_at DESC",
        (rs,n)->new DecisionRow(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getInt(8),rs.getObject(9,OffsetDateTime.class),rs.getObject(10,OffsetDateTime.class)));
  }
  public record DecisionRow(UUID id,UUID transferId,String customer,String decision,String reason,String maker,String checker,int version,OffsetDateTime createdAt,OffsetDateTime updatedAt) {}
}
