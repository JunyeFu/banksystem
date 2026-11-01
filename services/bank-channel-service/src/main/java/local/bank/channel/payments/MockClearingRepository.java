package local.bank.channel.payments;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Profile("mock-clearing")
@Repository
public class MockClearingRepository {
  private final JdbcTemplate jdbc;
  public MockClearingRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public List<Map<String,Object>> byKey(String key) {
    return jdbc.query("SELECT clearing_id,status FROM clearing_payment WHERE idempotency_key=?",
        (rs,n)->Map.<String,Object>of("id",rs.getString(1),"status",rs.getString(2)),key);
  }
  public void insertPayment(UUID id,String key,UUID transferId,String scenario,String status) {
    jdbc.update("""
        INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status,core_reference,amount,currency)
        SELECT ?,?,?,?, ?,core_reference,amount,currency FROM transfer_order WHERE transfer_id=?
        """,id,key,transferId,scenario,status,transferId);
  }
  public String transferStatus(UUID transferId) {
    return jdbc.queryForObject("SELECT status FROM transfer_order WHERE transfer_id=?",String.class,transferId);
  }
  public List<Map<String,Object>> lockPayment(UUID clearingId) {
    return jdbc.query("SELECT scenario,delivery_count,last_sequence,transfer_id FROM clearing_payment WHERE clearing_id=? FOR UPDATE",
        (rs,n)->{var value=new HashMap<String,Object>();value.put("scenario",rs.getString(1));value.put("count",rs.getInt(2));value.put("last",(Integer)rs.getObject(3));value.put("transferId",rs.getObject(4));return value;},clearingId);
  }
  public void delivered(UUID clearingId,int count,int sequence,String status) {
    jdbc.update("UPDATE clearing_payment SET delivery_count=?,last_sequence=?,status=? WHERE clearing_id=?",count,sequence,status,clearingId);
  }
  public void failureReason(UUID transferId,String reason) {
    jdbc.update("UPDATE transfer_order SET failure_reason=? WHERE transfer_id=?",reason,transferId);
  }
}
