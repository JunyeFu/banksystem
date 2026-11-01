package local.bank.channel.reconciliation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReconciliationRepository {
  private final JdbcTemplate jdbc;
  public ReconciliationRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public List<RunRow> forEod(UUID eodRunId,String type,String phase) {
    return jdbc.query("SELECT run_id,reconciliation_type,status,difference_count,details FROM reconciliation_run WHERE eod_run_id=? AND reconciliation_type=? AND phase=?",
        (rs,n)->new RunRow(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5)),eodRunId,type,phase);
  }
  public void create(UUID runId,String type,String status,int count,String details,UUID eodRunId,LocalDate businessDate,String phase) {
    jdbc.update("INSERT INTO reconciliation_run(run_id,reconciliation_type,status,difference_count,details,eod_run_id,business_date,phase) VALUES(?,?,?,?,?::jsonb,?,?,?)",
        runId,type,status,count,details,eodRunId,businessDate,phase);
  }
  public void difference(UUID runId,Difference difference) {
    jdbc.update("INSERT INTO reconciliation_difference(difference_id,run_id,transaction_id,field_name,expected_value,actual_value) VALUES(?,?,?,?,?,?)",
        UUID.randomUUID(),runId,difference.transactionId(),difference.field(),difference.expected(),difference.actual());
  }
  public List<ClearingFact> clearingFacts() {
    return jdbc.query("""
        SELECT t.transfer_id,t.status,t.core_reference,t.amount,t.currency,
               c.status,c.core_reference,c.amount,c.currency
          FROM clearing_payment c JOIN transfer_order t ON t.transfer_id=c.transfer_id
         WHERE c.status IN ('SETTLED','RETURNED')
        """,(rs,n)->new ClearingFact(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getBigDecimal(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getBigDecimal(8),rs.getString(9)));
  }
  public List<LedgerFact> ledgerFacts() {
    return jdbc.query("""
        SELECT t.transfer_id,t.amount,COALESCE(sum(p.debit),0),COALESCE(sum(p.credit),0),count(p.entry_id)
          FROM transfer_order t LEFT JOIN transfer_accounting_projection p ON p.transfer_id=t.transfer_id
         WHERE t.status IN ('SETTLED','RETURNED','REVERSED') GROUP BY t.transfer_id,t.amount
        """,(rs,n)->new LedgerFact(rs.getObject(1,UUID.class),rs.getBigDecimal(2),rs.getBigDecimal(3),rs.getBigDecimal(4),rs.getInt(5)));
  }
  public List<TransferFact> transferFacts() {
    return jdbc.query("""
        SELECT transfer_id,idempotency_key,source_account_id,destination_account_id,
               amount,currency,fineract_transfer_id FROM transfer_order
         WHERE status IN ('SETTLED','RETURNED','REVERSED') ORDER BY transfer_id
        """,(rs,n)->new TransferFact(rs.getObject(1,UUID.class),rs.getString(2),rs.getLong(3),rs.getLong(4),rs.getBigDecimal(5),rs.getString(6),rs.getObject(7,Long.class)));
  }
  public List<RunRow> latest() {
    return jdbc.query("SELECT run_id,reconciliation_type,status,difference_count,details FROM reconciliation_run ORDER BY created_at DESC LIMIT 1",
        (rs,n)->new RunRow(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5)));
  }
  public List<Map<String,Object>> listPublic() {
    return jdbc.query("SELECT run_id,reconciliation_type,status,difference_count,COALESCE(details->>'message',details::text),created_at FROM reconciliation_run ORDER BY created_at DESC",
        (rs,n)->publicRow(rs.getString(1),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5),rs.getObject(6,OffsetDateTime.class)));
  }
  public Map<String,Object> publicRun(UUID id) {
    return jdbc.queryForObject("SELECT run_id,reconciliation_type,status,difference_count,COALESCE(details->>'message',details::text),created_at FROM reconciliation_run WHERE run_id=?",
        (rs,n)->publicRow(rs.getString(1),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5),rs.getObject(6,OffsetDateTime.class)),id);
  }
  private static Map<String,Object> publicRow(String id,String type,String status,int count,String details,OffsetDateTime createdAt) {
    Map<String,Object> item=new LinkedHashMap<>();item.put("runId",id);item.put("type",type);item.put("status","DIFFERENCE".equals(status)?"DIFFERENCE_FOUND":status);item.put("differenceCount",count);item.put("details",details);item.put("createdAt",createdAt.toString());return item;
  }
  public record RunRow(UUID id,String type,String status,int count,String details) {}
  public record ClearingFact(UUID id,String transferStatus,String transferReference,BigDecimal transferAmount,String transferCurrency,String clearingStatus,String clearingReference,BigDecimal clearingAmount,String clearingCurrency) {}
  public record LedgerFact(UUID id,BigDecimal amount,BigDecimal debit,BigDecimal credit,int entries) {}
  public record TransferFact(UUID id,String idempotencyKey,long sourceAccountId,long destinationAccountId,BigDecimal amount,String currency,Long coreReference) {
    String expectedSummary() { return coreReference+":"+sourceAccountId+":"+destinationAccountId+":"+amount.stripTrailingZeros().toPlainString()+":"+currency; }
  }
  public record Difference(UUID transactionId,String field,String expected,String actual) {}
}
