package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.UUID;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.notifications.NotificationRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class CustomerRepositoryIntegrationTest {
  private static EmbeddedPostgres postgres;
  private JdbcTemplate jdbc;

  @BeforeAll
  static void startPostgres() throws java.io.IOException { postgres = EmbeddedPostgres.start(); }

  @AfterAll
  static void stopPostgres() throws java.io.IOException { if (postgres != null) postgres.close(); }

  @BeforeEach
  void setUp() {
    jdbc = new JdbcTemplate(postgres.getPostgresDatabase());
    jdbc.execute("DROP TABLE IF EXISTS beneficiary,notification");
    jdbc.execute("""
        CREATE TABLE beneficiary(beneficiary_id uuid PRIMARY KEY,subject varchar(128) NOT NULL,
          account_token char(64) NOT NULL,account_last4 varchar(4) NOT NULL,display_name varchar(160) NOT NULL,
          destination_account_id varchar(64),created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(subject,account_token))
        """);
    jdbc.execute("""
        CREATE TABLE notification(notification_id uuid PRIMARY KEY,subject varchar(128) NOT NULL,
          notification_type varchar(64) NOT NULL,payload text NOT NULL,read_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())
        """);
  }

  @Test
  void beneficiaryUpsertPreservesMaskedReadbackAndSubjectScope() {
    var repository = new BeneficiaryRepository(jdbc);
    String token = "a".repeat(64);
    var first = repository.save("customer-1","42",token,"0042","First");
    var updated = repository.save("customer-1","42",token,"0042","Updated");
    assertEquals(first.get("beneficiaryId"),updated.get("beneficiaryId"));
    assertEquals("****0042",updated.get("maskedAccountNumber"));
    assertEquals("Updated",updated.get("displayName"));
    assertEquals(1,((java.util.List<?>) repository.list("customer-1").get("items")).size());
    assertTrue(((java.util.List<?>) repository.list("customer-2").get("items")).isEmpty());
  }

  @Test
  void notificationReadIsScopedAndRepeatable() {
    var repository = new NotificationRepository(jdbc);
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES(?,?,?,?)",
        id,"customer-1","LOGIN","{}");
    assertEquals(0,repository.markRead("customer-2",id.toString()));
    assertFalse(repository.list("customer-1").get(0).read());
    assertEquals(1,repository.markRead("customer-1",id.toString()));
    assertEquals(1,repository.markRead("customer-1",id.toString()));
    assertTrue(repository.list("customer-1").get(0).read());
    assertTrue(repository.list("customer-2").isEmpty());
  }
}
