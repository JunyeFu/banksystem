package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LoanOperationRepository {
  private final JdbcTemplate jdbc;
  public LoanOperationRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public record Operation(UUID id,String command,BigDecimal amount,LocalDate date,String correlation,
                          String status,String response) {}
  public boolean claim(UUID id,UUID application,String key,String command,BigDecimal amount,LocalDate date,String correlation) {
    return jdbc.update("""
        INSERT INTO loan_core_operation(operation_id,application_id,idempotency_key,command,amount,posting_date,correlation_id,status)
        VALUES (?,?,?,?,?,?,?,'CLAIMED') ON CONFLICT(application_id,idempotency_key) DO NOTHING
        """,id,application,key,command,amount,date,correlation)==1;
  }
  public Operation find(UUID application,String key) {
    return jdbc.queryForObject("""
        SELECT operation_id,command,amount,posting_date,correlation_id,status,response::text
        FROM loan_core_operation WHERE application_id=? AND idempotency_key=?
        """,(rs,n)->new Operation(rs.getObject(1,UUID.class),rs.getString(2),rs.getBigDecimal(3),
        rs.getObject(4,LocalDate.class),rs.getString(5),rs.getString(6),rs.getString(7)),application,key);
  }
  public void unknown(UUID id) {
    jdbc.update("UPDATE loan_core_operation SET status='UNKNOWN',updated_at=now() WHERE operation_id=? AND status='CLAIMED'",id);
  }
  public void reject(UUID id) {
    jdbc.update("UPDATE loan_core_operation SET status='REJECTED',updated_at=now() WHERE operation_id=? AND status IN ('CLAIMED','UNKNOWN')",id);
  }
  public boolean complete(UUID id,String response) {
    return jdbc.update("UPDATE loan_core_operation SET status='COMPLETED',response=?::jsonb,updated_at=now() WHERE operation_id=? AND status IN ('CLAIMED','UNKNOWN')",response,id)==1;
  }
  public void outbox(UUID operation,UUID application,String payload) {
    jdbc.update("""
        INSERT INTO outbox_event(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,status)
        VALUES (?,'LoanApplication',?,'loan.operation.completed',1,?::jsonb,'{}'::jsonb,'PENDING')
        """,operation,application,payload);
  }
  public int pendingForEod() {
    return jdbc.queryForObject("""
        SELECT (SELECT count(*) FROM loan_core_operation WHERE status IN ('CLAIMED','UNKNOWN'))
          + (SELECT count(*) FROM loan_application WHERE core_idempotency_key IS NOT NULL AND core_loan_id IS NULL)
        """,Integer.class);
  }
}
