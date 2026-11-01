package local.bank.channel.payments;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EodRepository {
  private final JdbcTemplate jdbc;
  private final DataSource dataSource;
  public EodRepository(JdbcTemplate jdbc,DataSource dataSource) { this.jdbc=jdbc;this.dataSource=dataSource; }

  public LockHandle lock(LocalDate date) {
    Connection connection;
    try { connection=dataSource.getConnection(); }
    catch(SQLException e) { throw new IllegalStateException("EOD database connection failed",e); }
    try {
      try (var statement=connection.prepareStatement("SELECT pg_try_advisory_lock(hashtext(?))")) {
        statement.setString(1,"eod:core-jobs");
        try (var result=statement.executeQuery()) {
          result.next();
          if (!result.getBoolean(1)) { connection.close(); return null; }
        }
      }
      return new LockHandle(connection,date);
    } catch(SQLException e) {
      try { connection.close(); } catch(SQLException closeFailure) { e.addSuppressed(closeFailure); }
      throw new IllegalStateException("EOD database lock failed",e);
    }
  }
  public static final class LockHandle implements AutoCloseable {
    private final Connection connection;
    private final LocalDate date;
    private LockHandle(Connection connection,LocalDate date) { this.connection=connection;this.date=date; }
    @Override public void close() {
      try {
        try (var statement=connection.prepareStatement("SELECT pg_advisory_unlock(hashtext(?))")) {
          statement.setString(1,"eod:core-jobs");
          statement.execute();
        }
      } catch(SQLException e) { throw new IllegalStateException("EOD unlock failed",e); }
      finally { try { connection.close(); } catch(SQLException e) { throw new IllegalStateException("EOD lock connection close failed",e); } }
    }
  }
  public List<RunRow> byKey(String key) {
    return jdbc.query("SELECT run_id,business_date,status FROM eod_run WHERE idempotency_key=?",
        (rs,n)->new RunRow(rs.getObject(1,UUID.class),rs.getObject(2,LocalDate.class),rs.getString(3)),key);
  }
  public List<RunRow> active(LocalDate date) {
    return jdbc.query("""
        SELECT run_id,business_date,status FROM eod_run
         WHERE business_date=? AND status IN ('RUNNING','INTERRUPTED','COMPLETED')
         ORDER BY created_at DESC LIMIT 1
        """,(rs,n)->new RunRow(rs.getObject(1,UUID.class),rs.getObject(2,LocalDate.class),rs.getString(3)),date);
  }
  public void resume(UUID id) { jdbc.update("UPDATE eod_run SET status='RUNNING',reason='EOD resumed',updated_at=now() WHERE run_id=?",id); }
  public void create(UUID id,LocalDate date,String key) {
    jdbc.update("INSERT INTO eod_run(run_id,business_date,status,reconciliation_status,reason,idempotency_key) VALUES(?,?,'RUNNING','PENDING','EOD registered',?)",id,date,key);
  }
  public void completeStep(UUID runId,String step) {
    jdbc.update("DELETE FROM eod_run_step WHERE run_id=? AND step_name=?",runId,"STARTED:"+step);
    jdbc.update("INSERT INTO eod_run_step(run_id,step_name) VALUES(?,?) ON CONFLICT DO NOTHING",runId,step);
    jdbc.update("UPDATE eod_run SET updated_at=now() WHERE run_id=?",runId);
  }
  public List<String> completedSteps(UUID runId) {
    return jdbc.query("SELECT step_name FROM eod_run_step WHERE run_id=? AND step_name NOT LIKE 'STARTED:%' ORDER BY completed_at,step_name",(rs,n)->rs.getString(1),runId);
  }
  public record PendingStep(String name,Long version) {}
  public List<PendingStep> unresolvedSteps(UUID runId) {
    return jdbc.query("SELECT step_name,core_job_version FROM eod_run_step WHERE run_id=? AND step_name LIKE 'STARTED:%'",
        (rs,n)->new PendingStep(rs.getString(1).substring(8),rs.getObject(2,Long.class)),runId);
  }
  public void startCoreStep(UUID runId,String step,long version) {
    jdbc.update("INSERT INTO eod_run_step(run_id,step_name,core_job_version) VALUES (?,?,?)",runId,"STARTED:"+step,version);
  }
  public void finish(UUID runId,String status,String reconciliationStatus,String reason) {
    jdbc.update("UPDATE eod_run SET status=?,reconciliation_status=?,reason=?,updated_at=now(),version=version+1 WHERE run_id=?",status,reconciliationStatus,reason,runId);
  }
  public List<UUID> latest() { return jdbc.query("SELECT run_id FROM eod_run ORDER BY created_at DESC LIMIT 1",(rs,n)->rs.getObject(1,UUID.class)); }
  public List<UUID> current(LocalDate date) { return jdbc.query("SELECT run_id FROM eod_run WHERE business_date=?",(rs,n)->rs.getObject(1,UUID.class),date); }
  public Map<String,Object> view(UUID runId) {
    return jdbc.queryForObject("SELECT run_id,business_date,status,reconciliation_status,reason,created_at,updated_at FROM eod_run WHERE run_id=?",
        (rs,n)->{Map<String,Object> item=new LinkedHashMap<>();item.put("runId",rs.getObject(1,UUID.class).toString());item.put("businessDate",rs.getObject(2,LocalDate.class).toString());item.put("status",rs.getString(3));item.put("reconciliationStatus",rs.getString(4));item.put("reason",rs.getString(5));item.put("startedAt",rs.getTimestamp(6).toInstant().toString());item.put("completedAt",rs.getTimestamp(7).toInstant().toString());return item;},runId);
  }
  public record RunRow(UUID id,LocalDate date,String status) {}
}
