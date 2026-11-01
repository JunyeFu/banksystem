package local.bank.channel;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Profile("test-support")
@Repository
public class TestSupportProjectionRepository {
  private final JdbcTemplate jdbc;
  public TestSupportProjectionRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public List<Map<String,Object>> transfers(UUID id) {
    return jdbc.query("SELECT transfer_id,status,amount,currency,core_reference,correlation_id FROM transfer_order WHERE transfer_id=?",
        (rs,n)->Map.<String,Object>of("transferId",rs.getString(1),"status",rs.getString(2),"amount",rs.getBigDecimal(3).toPlainString(),"currency",rs.getString(4),"coreReference",rs.getString(5),"correlationId",rs.getString(6)),id);
  }
  public List<Map<String,Object>> history(UUID id) {
    return jdbc.query("SELECT from_status,to_status,actor_type,actor_id,created_at FROM transfer_state_history WHERE transfer_id=? ORDER BY id",
        (rs,n)->Map.<String,Object>of("fromStatus",rs.getString(1),"toStatus",rs.getString(2),"actorType",rs.getString(3),"actorId",rs.getString(4),"createdAt",rs.getString(5)),id);
  }
  public List<Map<String,Object>> outbox(UUID id) {
    return jdbc.query("SELECT id,event_type,published_at FROM outbox_event WHERE aggregate_id=?",
        (rs,n)->Map.<String,Object>of("eventId",rs.getString(1),"eventType",rs.getString(2),"publishedAt",rs.getString(3)),id);
  }
  public int auditCount(UUID id) {
    Integer count=jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE resource_id=?",Integer.class,id.toString());return count==null?0:count;
  }
  public boolean idempotencyExists(UUID id) {
    Integer count=jdbc.queryForObject("SELECT count(*) FROM idempotency_record WHERE scope_key IN (SELECT idempotency_key FROM transfer_order WHERE transfer_id=?)",Integer.class,id);return count!=null&&count>0;
  }
  public List<Map<String,Object>> accountingEntries(String correlationId) {
    return jdbc.query("SELECT entry_id,account_id,debit,credit,transfer_id FROM transfer_accounting_projection WHERE correlation_id=? ORDER BY created_at",
        (rs,n)->Map.<String,Object>of("entryId",rs.getString(1),"accountId",rs.getLong(2),"debit",rs.getBigDecimal(3).toPlainString(),"credit",rs.getBigDecimal(4).toPlainString(),"transferId",rs.getString(5)!=null?rs.getString(5):""),correlationId);
  }
  public List<Map<String,Object>> reconciliations(String correlationId) {
    return jdbc.query("SELECT reconciliation_type,status,difference_count,details FROM reconciliation_run WHERE details::jsonb ->> 'correlationId'=? ORDER BY created_at DESC LIMIT 5",(rs,n)->reconciliation(rs.getString(1),rs.getString(2),rs.getInt(3),rs.getString(4)),correlationId);
  }
  public List<Map<String,Object>> recentReconciliations() {
    return jdbc.query("SELECT reconciliation_type,status,difference_count,details FROM reconciliation_run ORDER BY created_at DESC LIMIT 5",(rs,n)->reconciliation(rs.getString(1),rs.getString(2),rs.getInt(3),rs.getString(4)));
  }
  private static Map<String,Object> reconciliation(String type,String status,int count,String details) {
    Map<String,Object> value=new LinkedHashMap<>();value.put("type",type);value.put("status",status);value.put("differences",count);value.put("details",details);return value;
  }
}
