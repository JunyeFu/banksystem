package local.bank.channel.payments;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
  private final JdbcTemplate jdbc;
  public OutboxRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public OutboxEvent claimNext(UUID publisherId) {
    var rows = jdbc.query("""
        WITH candidate AS (
          SELECT id FROM outbox_event
           WHERE (status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=now()))
              OR (status='PROCESSING' AND claimed_at<=now()-interval '5 minutes')
           ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE outbox_event o SET status='PROCESSING',claimed_at=now(),claim_owner=?,updated_at=now()
          FROM candidate c WHERE o.id=c.id
        RETURNING o.id,o.aggregate_id,o.event_type,o.payload::text,o.attempt_count,o.created_at
        """, (rs, n) -> new OutboxEvent(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
            rs.getString(3), rs.getString(4), rs.getInt(5), rs.getObject(6, OffsetDateTime.class)), publisherId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public void published(UUID eventId, UUID publisherId) {
    jdbc.update("UPDATE outbox_event SET published_at=now(),updated_at=now(),status='PUBLISHED',claimed_at=NULL,claim_owner=NULL WHERE id=? AND status='PROCESSING' AND claim_owner=?",
        eventId, publisherId);
  }

  public void retry(UUID eventId, UUID publisherId, int attempts, long backoffSeconds) {
    jdbc.update("UPDATE outbox_event SET attempt_count=?,next_attempt_at=now()+interval '1 second'*?,updated_at=now(),status='PENDING',claimed_at=NULL,claim_owner=NULL WHERE id=? AND status='PROCESSING' AND claim_owner=?",
        attempts, backoffSeconds, eventId, publisherId);
  }

  public void deadLetter(OutboxEvent event, UUID publisherId, int attempts, String reason) {
    jdbc.update("""
        WITH dead AS (
          INSERT INTO dead_letter_event(event_id,consumer_name,reason,payload)
          VALUES (?,?,?,?) ON CONFLICT(event_id) DO NOTHING
        )
        UPDATE outbox_event SET status='DEAD_LETTERED',published_at=NULL,attempt_count=?,
          updated_at=now(),claimed_at=NULL,claim_owner=NULL
        WHERE id=? AND status='PROCESSING' AND claim_owner=?
        """, event.eventId(), "outbox-publisher", reason, event.payload(), attempts,
        event.eventId(), publisherId);
  }

  public record OutboxEvent(UUID eventId, UUID aggregateId, String eventType,
                           String payload, int attemptCount, OffsetDateTime createdAt) {}
}
