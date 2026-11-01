package local.bank.channel.payments;

import java.math.BigDecimal;
import java.util.UUID;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TransferProcessingRepository {
  private final JdbcTemplate jdbc;
  public TransferProcessingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public boolean claimCoreSubmission(UUID id) {
    return jdbc.update("UPDATE transfer_order SET core_submission_started_at=now(), updated_at=now() "
        + "WHERE transfer_id=? AND status='PENDING_CORE_POSTING' AND core_submission_started_at IS NULL",id)==1;
  }

  public void verified(UUID id, long coreId) {
    jdbc.update("UPDATE transfer_order SET core_reference=?, fineract_transfer_id=?, core_verified_at=now(), "
            + "failure_code=NULL, failure_detail=NULL WHERE transfer_id=?",String.valueOf(coreId),coreId,id);
  }

  public void projection(UUID transferId, long accountId, BigDecimal debit, BigDecimal credit, String correlation) {
    jdbc.update("INSERT INTO transfer_accounting_projection(entry_id,account_id,debit,credit,correlation_id,transfer_id) "
            + "VALUES (?,?,?,?,?,?) ON CONFLICT (transfer_id,account_id) DO NOTHING",
        UUID.randomUUID(),accountId,debit,credit,correlation,transferId);
  }

  public void rejected(UUID id, String reason) {
    jdbc.update("UPDATE transfer_order SET failure_code='CORE_REJECTED', failure_detail=? WHERE transfer_id=?",reason,id);
  }

  public void unknown(UUID id, String reason) {
    jdbc.update("UPDATE transfer_order SET failure_code='CORE_RESULT_UNKNOWN', failure_detail=?, updated_at=now() WHERE transfer_id=?",
        reason,id);
  }

  public TransferWork load(UUID id, boolean lock) {
    var rows = jdbc.query("SELECT source_account_id,destination_account_id,amount,currency,status,idempotency_key,"
            + "subject,correlation_id,core_submission_started_at,core_reference FROM transfer_order WHERE transfer_id=?"
            + (lock?" FOR UPDATE":""),
        (rs,n) -> new TransferWork(id,rs.getLong(1),rs.getLong(2),rs.getBigDecimal(3),rs.getString(4),
            Status.of(rs.getString(5)),rs.getString(6),rs.getString(7),rs.getString(8),
            rs.getObject(9)!=null,rs.getString(10)),id);
    return rows.isEmpty()?null:rows.get(0);
  }

  public record TransferWork(UUID transferId, long sourceAccountId, long destinationAccountId,
                             BigDecimal amount, String currency, Status status, String idempotencyKey,
                             String subject, String correlation, boolean submissionStarted,
                             String coreReference) {
    public TransferWork withStatus(Status next) {
      return new TransferWork(transferId,sourceAccountId,destinationAccountId,amount,currency,next,
          idempotencyKey,subject,correlation,submissionStarted,coreReference);
    }
  }
}
