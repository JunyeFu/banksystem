package local.bank.channel.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import local.bank.channel.payments.OutboxRepository.OutboxEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jms.core.JmsTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OutboxPublisher {
  private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
  private static final int MAX_ATTEMPTS = 5;

  private final OutboxRepository repository;
  private final JmsTemplate jms;
  private final ObjectMapper mapper;
  private final UUID publisherId = UUID.randomUUID();

  public OutboxPublisher(OutboxRepository repository, JmsTemplate jms, ObjectMapper mapper) {
    this.repository = repository;
    this.jms = jms;
    this.mapper = mapper;
  }

  @Scheduled(fixedDelay = 5000)
  public void publishPending() {
    for (int published = 0; published < 100; published++) {
      OutboxEvent event = repository.claimNext(publisherId);
      if (event == null) return;
      try {
        deliverEvent(event);
        repository.published(event.eventId(), publisherId);
        log.info("Outbox event published via JMS: eventId={} eventType={}",
            event.eventId(), event.eventType());
      } catch (Exception e) {
        int attempts = event.attemptCount() + 1;
        if (attempts >= MAX_ATTEMPTS) {
          log.error("Outbox event moved to DLQ after {} attempts: eventId={} error={}",
              attempts, event.eventId(), e.getMessage());
          deadLetter(event, attempts, e);
        } else {
          long backoffSeconds = (long) Math.pow(2, attempts);
          log.warn("Outbox event retry {}/{}: eventId={} nextAttempt in {}s error={}",
              attempts, MAX_ATTEMPTS, event.eventId(), backoffSeconds, e.getMessage());
          repository.retry(event.eventId(), publisherId, attempts, backoffSeconds);
        }
      }
    }
  }

  private void deadLetter(OutboxEvent event, int attempts, Exception failure) {
    String reason = "Max attempts exceeded: " + failure.getMessage();
    if (reason.length() > 240) reason = reason.substring(0, 240);
    repository.deadLetter(event, publisherId, attempts, reason);
  }

  private void deliverEvent(OutboxEvent event) {
    String eventType = event.eventType();
    String queueName = "bank." + eventType;
    try {
      jms.convertAndSend(queueName, envelope(event), message -> {
        message.setStringProperty("eventId", event.eventId().toString());
        message.setStringProperty("eventType", event.eventType());
        message.setStringProperty("aggregateId", event.aggregateId().toString());
        return message;
      });
      log.info("JMS message sent to queue={}: eventId={}", queueName, event.eventId());
    } catch (Exception e) {
      log.warn("JMS delivery failed for queue={}: {}", queueName, e.getMessage());
      throw e;
    }
  }

  private String envelope(OutboxEvent event) {
    try {
      ObjectNode envelope = (ObjectNode) mapper.readTree(event.payload());
      envelope.put("eventId", event.eventId().toString());
      envelope.put("eventType", event.eventType());
      envelope.put("occurredAt", event.createdAt().toInstant().toString());
      return mapper.writeValueAsString(envelope);
    } catch (Exception e) {
      throw new IllegalStateException("Outbox payload is not a JSON object: " + event.eventId(), e);
    }
  }

}
