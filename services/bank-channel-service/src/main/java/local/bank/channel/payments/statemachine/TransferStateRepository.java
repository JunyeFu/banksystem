package local.bank.channel.payments.statemachine;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TransferStateRepository {
  private final JdbcTemplate jdbc;
  public TransferStateRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public void history(UUID transferId, String from, String to, String actorType, String actorId,
                      String reason, String metadataJson) {
    jdbc.update("INSERT INTO transfer_state_history(transfer_id,from_status,to_status,reason_code,actor_type,actor_id,metadata) "
            + "VALUES (?,?,?,?,?,?,?::jsonb)", transferId, from, to, reason, actorType, actorId, metadataJson);
  }

  public int changeStatus(UUID transferId, String from, String to) {
    if (from == null) return jdbc.update(
        "UPDATE transfer_order SET status=?, version=version+1, updated_at=now() WHERE transfer_id=? AND status IS NULL",
        to, transferId);
    return jdbc.update("UPDATE transfer_order SET status=?, version=version+1, updated_at=now() WHERE transfer_id=? AND status=?",
        to, transferId, from);
  }

  public void outbox(UUID transferId, String eventType, String payload) {
    jdbc.update("INSERT INTO outbox_event(id,transfer_id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,status) "
            + "VALUES (?,?,?,?,?,?,?::jsonb,?::jsonb,?)",
        UUID.randomUUID(), transferId, "Transfer", transferId, eventType, 1, payload, "{}", "PENDING");
  }
}
