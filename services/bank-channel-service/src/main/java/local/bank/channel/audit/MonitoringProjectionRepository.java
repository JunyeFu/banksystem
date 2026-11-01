package local.bank.channel.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MonitoringProjectionRepository {
  private final JdbcTemplate jdbc;
  public MonitoringProjectionRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public Snapshot snapshot() {
    return new Snapshot(
        count("SELECT count(*) FROM transfer_order WHERE status IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING')"),
        count("SELECT count(*) FROM outbox_event WHERE status = 'PENDING'"),
        count("SELECT count(*) FROM reconciliation_run WHERE status='DIFFERENCE'"),
        count("SELECT count(*) FROM dead_letter_event"),
        count("SELECT count(*) FROM eod_run WHERE status='FAILED' AND created_at > now() - interval '24 hours'"));
  }
  private int count(String sql) { Integer value=jdbc.queryForObject(sql,Integer.class); return value==null?0:value; }
  public record Snapshot(int pending,int undelivered,int differences,int dlq,int eodFailed) {}
}
