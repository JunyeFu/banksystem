package local.bank.channel.payments;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TransferReversalRepository {
  private final JdbcTemplate jdbc;
  public TransferReversalRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
  public List<Map<String,Object>> approvals(String status) {
    String filter=status==null||status.isBlank()?"":" WHERE r.status=?";
    String sql="SELECT r.reversal_id,r.transfer_id,r.maker_subject,r.checker_subject,r.status,r.reason,r.version,r.core_reference,r.created_at,r.updated_at,t.amount,t.currency,t.source_account_id,t.destination_account_id FROM transfer_reversal r JOIN transfer_order t ON t.transfer_id=r.transfer_id"+filter+" ORDER BY r.created_at DESC";
    Object[] args=filter.isEmpty()?new Object[0]:new Object[]{status};
    return jdbc.query(sql,(rs,n)->{Map<String,Object> item=new LinkedHashMap<>();String id=rs.getObject(1,UUID.class).toString();item.put("approvalId",id);item.put("reversalId",id);item.put("transferId",rs.getObject(2,UUID.class).toString());item.put("creator",rs.getString(3));item.put("checker",rs.getString(4));item.put("status",rs.getString(5));item.put("reason",rs.getString(6));item.put("version",rs.getInt(7));item.put("coreReference",rs.getString(8));item.put("createdAt",rs.getObject(9,OffsetDateTime.class).toString());item.put("updatedAt",rs.getObject(10,OffsetDateTime.class).toString());item.put("amount",rs.getBigDecimal(11).toPlainString());item.put("currency",rs.getString(12));item.put("sourceAccountId",rs.getString(13));item.put("destinationAccountId",rs.getString(14));return item;},args);
  }
  public List<String> lockTransferStatus(UUID transferId) {
    return jdbc.query("SELECT status FROM transfer_order WHERE transfer_id=? FOR UPDATE",(rs,n)->rs.getString(1),transferId);
  }
  public void create(UUID id,UUID transferId,String maker,String reason) {
    jdbc.update("INSERT INTO transfer_reversal(reversal_id,transfer_id,maker_subject,status,reason) VALUES(?,?,?,?,?)",id,transferId,maker,"PENDING",reason);
  }
  public List<ReversalWork> lockForApproval(UUID id) {
    return jdbc.query("SELECT r.transfer_id,r.maker_subject,r.checker_subject,r.status,r.version,r.core_reference,r.core_submission_started_at,r.idempotency_key,t.source_account_id,t.destination_account_id,t.amount,t.currency FROM transfer_reversal r JOIN transfer_order t ON t.transfer_id=r.transfer_id WHERE r.reversal_id=? FOR UPDATE",
        (rs,n)->new ReversalWork(id,rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getString(6),rs.getObject(7)!=null,rs.getString(8),rs.getLong(9),rs.getLong(10),rs.getBigDecimal(11),rs.getString(12),false),id);
  }
  public void claim(UUID id,String checker,String key) {
    jdbc.update("UPDATE transfer_reversal SET checker_subject=?,idempotency_key=?,core_submission_started_at=now(),updated_at=now() WHERE reversal_id=?",checker,key,id);
  }
  public List<String> lockStatus(UUID id) {
    return jdbc.query("SELECT status FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",(rs,n)->rs.getString(1),id);
  }
  public void confirm(UUID id,String coreReference) {
    jdbc.update("UPDATE transfer_reversal SET status='CONFIRMED',core_reference=?,core_verified_at=now(),failure_detail=NULL,version=version+1,updated_at=now() WHERE reversal_id=?",coreReference,id);
  }
  public void markUnknown(UUID id,String detail) {
    jdbc.update("UPDATE transfer_reversal SET status='CORE_RESULT_UNKNOWN',failure_detail=?,updated_at=now() WHERE reversal_id=? AND status IN ('PENDING','CORE_RESULT_UNKNOWN')",detail,id);
  }
  public void rejectFromCore(UUID id,String detail) {
    jdbc.update("UPDATE transfer_reversal SET status='REJECTED',failure_detail=?,version=version+1,updated_at=now() WHERE reversal_id=?",detail,id);
  }
  public List<Map<String,Object>> lockForRejection(UUID id) {
    return jdbc.query("SELECT transfer_id,maker_subject,status,version,core_submission_started_at FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",
        (rs,n)->Map.<String,Object>of("transfer",rs.getObject(1),"maker",rs.getString(2),"status",rs.getString(3),"version",rs.getInt(4),"submitted",rs.getObject(5)!=null),id);
  }
  public void rejectByChecker(UUID id,String checker) {
    jdbc.update("UPDATE transfer_reversal SET checker_subject=?,status='REJECTED',version=version+1,updated_at=now() WHERE reversal_id=?",checker,id);
  }
  public record ReversalWork(UUID reversalId,UUID transferId,String maker,String checker,String status,int version,String coreReference,boolean submissionStarted,String idempotencyKey,long source,long destination,BigDecimal amount,String currency,boolean submit) {
    ReversalWork withSubmission(String nextChecker,String key,boolean shouldSubmit) { return new ReversalWork(reversalId,transferId,maker,nextChecker,status,version,coreReference,true,key,source,destination,amount,currency,shouldSubmit); }
  }
}
