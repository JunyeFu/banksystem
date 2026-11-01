package local.bank.channel.operations;

import java.math.BigDecimal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DashboardProjectionRepository {
  private static final String ACTIVE_STATUSES = "'CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING'";
  private static final String FAILED_STATUSES = "'FAILED','TIMED_OUT','RETURNED','REVERSED'";
  private final JdbcTemplate jdbc;
  public DashboardProjectionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public Snapshot snapshot() {
    int pendingApprovals = count("SELECT count(*) FROM loan_approval WHERE status='PENDING'");
    int activePayments = count("SELECT count(*) FROM transfer_order WHERE status IN (" + ACTIVE_STATUSES + ")");
    int failedPayments = count("SELECT count(*) FROM transfer_order WHERE status IN (" + FAILED_STATUSES + ")");
    int todayPaymentCount = count("SELECT count(*) FROM transfer_order WHERE created_at >= CURRENT_DATE");
    int settledToday = count("SELECT count(*) FROM transfer_order WHERE status='SETTLED' AND created_at >= CURRENT_DATE");
    int pendingAlerts = count("SELECT count(*) FROM outbox_event WHERE status='PENDING'")
        + count("SELECT count(*) FROM dead_letter_event")
        + count("SELECT count(*) FROM eod_run WHERE status='FAILED' AND created_at > now() - interval '24 hours'");
    int clearingExceptions = count("SELECT count(*) FROM clearing_payment WHERE status IN ('REJECTED','FAILED','TIMED_OUT')");
    BigDecimal todayPaymentAmount = jdbc.queryForObject("SELECT COALESCE(sum(amount),0) FROM transfer_order WHERE created_at >= CURRENT_DATE", BigDecimal.class);
    return new Snapshot(pendingApprovals,activePayments,failedPayments,todayPaymentCount,settledToday,pendingAlerts,clearingExceptions,latestReconciliationStatus(),todayPaymentAmount);
  }
  private int count(String sql) { Integer value=jdbc.queryForObject(sql,Integer.class); return value==null?0:value; }
  private String latestReconciliationStatus() {
    var statuses=jdbc.query("SELECT status FROM reconciliation_run ORDER BY created_at DESC LIMIT 1",(rs,n)->rs.getString(1));
    return statuses.isEmpty()?"NOT_RUN":statuses.get(0);
  }
  public record Snapshot(int pendingApprovals,int activePayments,int failedPayments,int todayPaymentCount,int settledToday,int pendingAlerts,int clearingExceptions,String reconciliationStatus,BigDecimal todayPaymentAmount) {}
}
