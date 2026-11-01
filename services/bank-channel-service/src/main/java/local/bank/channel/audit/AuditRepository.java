package local.bank.channel.audit;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuditRepository {
  private final JdbcTemplate jdbc;
  public AuditRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public void lockChain() { jdbc.execute("SELECT pg_advisory_xact_lock(520052)"); }
  public Tail tail() {
    return jdbc.query("SELECT record_hash,created_at FROM security_audit_event ORDER BY created_at DESC,id DESC LIMIT 1",
        rs -> rs.next() ? new Tail(rs.getString(1), rs.getObject(2, OffsetDateTime.class)) : null);
  }
  public void append(AuditRecordHasher.AuditRecord record, String hash) {
    jdbc.update("INSERT INTO security_audit_event(id,event_type,actor_type,actor_id,tenant_id,resource_type,resource_id,action,outcome,request_id,correlation_id,before_json,after_json,previous_hash,record_hash,created_at,hash_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,?,?,?)",
        record.id(), record.eventType(), record.actorType(), record.actorId(), record.tenantId(), record.resourceType(), record.resourceId(), record.action(), record.outcome(),
        record.requestId(), record.correlationId(), record.beforeJson(), record.afterJson(), record.previousHash(), hash, record.createdAt(), record.hashVersion());
  }
  public record Tail(String recordHash, OffsetDateTime createdAt) {}
  public boolean successfulScenarioFunding(String subject) {
    Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM security_audit_event WHERE resource_type='CustomerScenario' AND resource_id=? AND action='FUND' AND outcome='SUCCESS'",Integer.class,subject);
    return count!=null&&count>0;
  }

  public List<Map<String,Object>> events(String eventType, String actor, String outcome, String correlation) {
    return jdbc.query("""
        SELECT id,event_type,actor_id,action,resource_type,resource_id,outcome,record_hash,previous_hash,correlation_id,created_at
        FROM security_audit_event
        WHERE (? IS NULL OR event_type=?) AND (?='' OR lower(actor_id) LIKE lower('%'||?||'%'))
          AND (? IS NULL OR outcome=?) AND (?='' OR correlation_id=?)
        ORDER BY created_at DESC,id DESC LIMIT 500
        """,(rs,n)->{Map<String,Object> item=new LinkedHashMap<>();item.put("eventId",rs.getString(1));item.put("eventType",rs.getString(2));item.put("actorId",rs.getString(3));item.put("action",rs.getString(4));item.put("resourceType",rs.getString(5));item.put("resourceId",rs.getString(6));item.put("outcome",rs.getString(7));item.put("recordHash",rs.getString(8));item.put("previousHash",rs.getString(9));item.put("correlationId",rs.getString(10));item.put("timestamp",rs.getObject(11,OffsetDateTime.class).toString());return item;},
        eventType,eventType,actor,actor,outcome,outcome,correlation,correlation);
  }
  public List<AuditRecordHasher.AuditRecord> records() {
    return jdbc.query("SELECT hash_version,id,event_type,actor_type,actor_id,tenant_id,resource_type,resource_id,action,outcome,request_id,correlation_id,before_json::text,after_json::text,previous_hash,created_at,record_hash FROM security_audit_event ORDER BY created_at,id",
        (rs,n)->new AuditRecordHasher.AuditRecord(rs.getInt(1),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8),rs.getString(9),rs.getString(10),rs.getString(11),rs.getString(12),rs.getString(13),rs.getString(14),rs.getString(15),rs.getObject(16,OffsetDateTime.class),rs.getString(17)));
  }
}
