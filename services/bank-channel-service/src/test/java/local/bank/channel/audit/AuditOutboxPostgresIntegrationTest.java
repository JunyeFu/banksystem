package local.bank.channel.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import jakarta.jms.Message;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import local.bank.channel.payments.InboxService;
import local.bank.channel.payments.OutboxPublisher;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jms.core.JmsTemplate;
import org.springframework.jms.core.MessagePostProcessor;

class AuditOutboxPostgresIntegrationTest {
  private static EmbeddedPostgres postgres;
  private JdbcTemplate jdbc;
  private AuditService audit;
  private OperationsAuditController controller;
  private JmsTemplate jms;

  @BeforeAll
  static void startPostgres() throws java.io.IOException {
    postgres = EmbeddedPostgres.start();
  }

  @AfterAll
  static void stopPostgres() throws java.io.IOException {
    if (postgres != null) postgres.close();
  }

  @BeforeEach
  void setUp() {
    var dataSource = postgres.getPostgresDatabase();
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("DROP TABLE IF EXISTS dead_letter_event");
    jdbc.execute("DROP TABLE IF EXISTS inbox_event");
    jdbc.execute("DROP TABLE IF EXISTS outbox_event");
    jdbc.execute("DROP TABLE IF EXISTS security_audit_event");
    jdbc.execute("""
        CREATE TABLE security_audit_event(
          id uuid PRIMARY KEY,event_type varchar(128) NOT NULL,actor_type varchar(32) NOT NULL,
          actor_id varchar(128) NOT NULL,tenant_id varchar(64) NOT NULL,resource_type varchar(64),
          resource_id varchar(128),action varchar(64) NOT NULL,outcome varchar(32) NOT NULL,
          request_id varchar(128),correlation_id varchar(128),before_json jsonb,after_json jsonb,
          previous_hash char(64),record_hash char(64) NOT NULL,created_at timestamptz NOT NULL,
          hash_version integer NOT NULL DEFAULT 2)
        """);
    jdbc.execute("""
        CREATE TABLE outbox_event(
          id uuid PRIMARY KEY,aggregate_id uuid NOT NULL,event_type varchar(96) NOT NULL,payload jsonb NOT NULL,
          status varchar(32) NOT NULL,attempt_count integer NOT NULL DEFAULT 0,next_attempt_at timestamptz,
          published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
          claimed_at timestamptz,claim_owner uuid)
        """);
    jdbc.execute("""
        CREATE TABLE dead_letter_event(
          event_id uuid PRIMARY KEY,consumer_name varchar(96) NOT NULL,reason varchar(240) NOT NULL,
          payload text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())
        """);
    jdbc.execute("""
        CREATE TABLE inbox_event(
          consumer_name varchar(96) NOT NULL,event_id uuid NOT NULL,processed_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(consumer_name,event_id))
        """);
    var hasher = new AuditRecordHasher(new ObjectMapper());
    audit = new AuditService(new AuditRepository(jdbc), hasher, new DataSourceTransactionManager(dataSource));
    controller = new OperationsAuditController(new AuditRepository(jdbc), hasher);
    jms = mock(JmsTemplate.class);
  }

  @Test
  void concurrentAuditAppendsProduceOneVerifiableChainAndDetectTampering() throws Exception {
    int count = 24;
    var pool = Executors.newFixedThreadPool(8);
    var ready = new CountDownLatch(8);
    var start = new CountDownLatch(1);
    var tasks = new ArrayList<Callable<Void>>();
    for (int i = 0; i < count; i++) {
      int sequence = i;
      tasks.add(() -> {
        ready.countDown();
        start.await();
        audit.record("TRANSFER_EVENT", "SYSTEM", "publisher-" + sequence, "Transfer",
            "T-" + sequence, "APPEND", "SUCCESS", null, Map.of("sequence", sequence));
        return null;
      });
    }
    var futures = tasks.stream().map(pool::submit).toList();
    ready.await();
    start.countDown();
    for (var future : futures) future.get();
    pool.shutdown();

    assertEquals(count, jdbc.queryForObject("SELECT count(*) FROM security_audit_event", Integer.class));
    assertTrue((Boolean) controller.verify().get("verified"));

    UUID changed = jdbc.queryForObject("SELECT id FROM security_audit_event ORDER BY created_at,id LIMIT 1", UUID.class);
    jdbc.update("UPDATE security_audit_event SET after_json='{\"sequence\":999}'::jsonb WHERE id=?", changed);
    Map<String, Object> verification = controller.verify();
    assertFalse((Boolean) verification.get("verified"));
    assertEquals(changed.toString(), verification.get("brokenAtEventId"));
  }

  @Test
  void invalidAuditMetadataFailsInsteadOfWritingEmptyJson() {
    Map<String, Object> recursive = new HashMap<>();
    recursive.put("self", recursive);
    assertThrows(IllegalArgumentException.class, () -> audit.record("INVALID", "SYSTEM", "test",
        "Fixture", "one", "WRITE", "FAILED", null, recursive));
    assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM security_audit_event", Integer.class));
  }

  @Test
  void twoPublishersClaimEachEventOnlyOnce() throws Exception {
    for (int i = 0; i < 20; i++) insertOutbox(0);
    var first = new OutboxPublisher(new local.bank.channel.payments.OutboxRepository(jdbc), jms, new ObjectMapper());
    var second = new OutboxPublisher(new local.bank.channel.payments.OutboxRepository(jdbc), jms, new ObjectMapper());
    var pool = Executors.newFixedThreadPool(2);
    var one = pool.submit(first::publishPending);
    var two = pool.submit(second::publishPending);
    one.get();
    two.get();
    pool.shutdown();

    verify(jms, times(20)).convertAndSend(anyString(), any(), any(org.springframework.jms.core.MessagePostProcessor.class));
    assertEquals(20, jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE status='PUBLISHED'", Integer.class));
    assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE status='PROCESSING'", Integer.class));
  }

  @Test
  void publishedMessageMatchesAsyncContractAndCarriesEventIdProperty() throws Exception {
    UUID eventId = insertOutbox(0);
    new OutboxPublisher(new local.bank.channel.payments.OutboxRepository(jdbc), jms, new ObjectMapper()).publishPending();

    var destination = ArgumentCaptor.forClass(String.class);
    var body = ArgumentCaptor.forClass(Object.class);
    var processor = ArgumentCaptor.forClass(MessagePostProcessor.class);
    verify(jms).convertAndSend(destination.capture(), body.capture(), processor.capture());
    assertEquals("bank.transfer.status.changed", destination.getValue());
    var envelope = new ObjectMapper().readTree((String) body.getValue());
    assertEquals(eventId.toString(), envelope.get("eventId").asText());
    assertEquals("transfer.status.changed", envelope.get("eventType").asText());
    assertTrue(envelope.hasNonNull("occurredAt"));

    Message message = mock(Message.class);
    processor.getValue().postProcessMessage(message);
    verify(message).setStringProperty("eventId", eventId.toString());
  }

  @Test
  void fifthFailureIsDeadLetteredAndInboxDeduplicatesByEventId() {
    doThrow(new IllegalStateException("broker rejected message")).when(jms)
        .convertAndSend(anyString(), any(), any(org.springframework.jms.core.MessagePostProcessor.class));
    UUID eventId = insertOutbox(4);
    new OutboxPublisher(new local.bank.channel.payments.OutboxRepository(jdbc), jms, new ObjectMapper()).publishPending();

    assertEquals("DEAD_LETTERED", jdbc.queryForObject(
        "SELECT status FROM outbox_event WHERE id=?", String.class, eventId));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM dead_letter_event WHERE event_id=?", Integer.class, eventId));
    assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE id=? AND published_at IS NOT NULL", Integer.class, eventId));

    InboxService inbox = new InboxService(new local.bank.channel.payments.InboxRepository(jdbc));
    assertTrue(inbox.claim("quality-projection", eventId));
    assertFalse(inbox.claim("quality-projection", eventId));
    assertTrue(inbox.claim("operations-projection", eventId));
  }

  private UUID insertOutbox(int attempts) {
    UUID eventId = UUID.randomUUID();
    jdbc.update("INSERT INTO outbox_event(id,aggregate_id,event_type,payload,status,attempt_count) VALUES(?,?,?,'{}'::jsonb,'PENDING',?)",
        eventId, UUID.randomUUID(), "transfer.status.changed", attempts);
    return eventId;
  }
}
