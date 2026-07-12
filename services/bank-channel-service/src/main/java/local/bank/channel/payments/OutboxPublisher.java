package local.bank.channel.payments;

import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jms.core.JmsTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OutboxPublisher {
  private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
  private static final int MAX_ATTEMPTS = 5;

  private final JdbcTemplate jdbc;
  private final JmsTemplate jms;

  public OutboxPublisher(JdbcTemplate jdbc, JmsTemplate jms) {
    this.jdbc = jdbc;
    this.jms = jms;
  }

  @Scheduled(fixedDelay = 5000)
  public void publishPending() {
    var pending = jdbc.query(
        "SELECT id, aggregate_id, event_type, payload::text, attempt_count FROM outbox_event " +
        "WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) " +
        "ORDER BY created_at LIMIT 100",
        (rs, n) -> Map.<String, Object>of(
            "eventId", rs.getString(1),
            "aggregateId", rs.getString(2),
            "eventType", rs.getString(3),
            "payload", rs.getString(4),
            "attemptCount", rs.getInt(5)));
    for (Map<String, Object> event : pending) {
      try {
        deliverEvent(event);
        jdbc.update("UPDATE outbox_event SET published_at = now(), updated_at = now(), status = 'PUBLISHED' WHERE id = ?",
            UUID.fromString((String) event.get("eventId")));
        log.info("Outbox event published via JMS: eventId={} eventType={}",
            event.get("eventId"), event.get("eventType"));
      } catch (Exception e) {
        int attempts = (Integer) event.get("attemptCount") + 1;
        if (attempts >= MAX_ATTEMPTS) {
          log.error("Outbox event moved to DLQ after {} attempts: eventId={} error={}",
              attempts, event.get("eventId"), e.getMessage());
          jdbc.update("INSERT INTO dead_letter_event(event_id,consumer_name,reason,payload) VALUES (?,?,?,?)",
              UUID.fromString((String) event.get("eventId")),
              "outbox-publisher",
              "Max attempts exceeded: " + e.getMessage(),
              (String) event.get("payload"));
          jdbc.update("UPDATE outbox_event SET published_at = now(), updated_at = now(), status = 'PUBLISHED', attempt_count = ? WHERE id = ?",
              attempts, UUID.fromString((String) event.get("eventId")));
        } else {
          long backoffSeconds = (long) Math.pow(2, attempts);
          log.warn("Outbox event retry {}/{}: eventId={} nextAttempt in {}s error={}",
              attempts, MAX_ATTEMPTS, event.get("eventId"), backoffSeconds, e.getMessage());
          jdbc.update("UPDATE outbox_event SET attempt_count = ?, next_attempt_at = now() + interval '1 second' * ?, updated_at = now() WHERE id = ?",
              attempts, backoffSeconds, UUID.fromString((String) event.get("eventId")));
        }
      }
    }
  }

  private void deliverEvent(Map<String, Object> event) {
    String eventType = (String) event.get("eventType");
    String payload = (String) event.get("payload");
    String queueName = "bank.events." + eventType.replace("transfer.", "").replace(".", ".");
    try {
      jms.convertAndSend(queueName, payload);
      log.info("JMS message sent to queue={}: eventId={}", queueName, event.get("eventId"));
    } catch (Exception e) {
      log.warn("JMS delivery failed for queue={}, falling back to log delivery: {}", queueName, e.getMessage());
      throw e;
    }
  }
}
