package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class FixtureLifecycleIntegrationTest {
  private static EmbeddedPostgres postgres;

  @BeforeAll
  static void startPostgres() throws IOException { postgres = EmbeddedPostgres.start(); }

  @AfterAll
  static void stopPostgres() throws IOException { postgres.close(); }

  @Test
  void canonicalCatalogContainsBothBankingProducts() {
    var catalog = new FixtureCatalog(Path.of("../../contracts/fixtures/baseline-fixtures.yaml").toString());
    assertEquals("BankSystem GL Demo Savings v1", catalog.require("product.demo.primarySavings").get("name"));
    assertEquals("Hengzhun Demo Loan", catalog.require("product.demo.basicLoan").get("name"));
  }

  @Test
  void resetRemovesOnlyFixtureMappingsAndPreservesBusinessHistory() {
    JdbcTemplate jdbc = new JdbcTemplate(postgres.getPostgresDatabase());
    jdbc.execute("DROP TABLE IF EXISTS customer_identity, transfer_order, security_audit_event");
    jdbc.execute("CREATE TABLE customer_identity(subject varchar(128) PRIMARY KEY, fineract_client_id bigint NOT NULL)");
    jdbc.execute("CREATE TABLE transfer_order(transfer_id bigint PRIMARY KEY)");
    jdbc.execute("CREATE TABLE security_audit_event(id bigint PRIMARY KEY)");
    jdbc.update("INSERT INTO customer_identity VALUES (?,?)", "fixture-alice", 11L);
    jdbc.update("INSERT INTO customer_identity VALUES (?,?)", "fixture-bob", 12L);
    jdbc.update("INSERT INTO customer_identity VALUES (?,?)", "keycloak-customer-001", 11L);
    jdbc.update("INSERT INTO transfer_order VALUES (?)", 91L);
    jdbc.update("INSERT INTO security_audit_event VALUES (?)", 92L);

    var catalog = new FixtureCatalog(Path.of("../../contracts/fixtures/baseline-fixtures.yaml").toString());
    var service = new FixtureLifecycleService(catalog, mock(FineractAccountPort.class),
        mock(FineractCustomerPort.class), mock(FineractLoanPort.class), new local.bank.channel.identity.CustomerIdentityRepository(jdbc));
    assertEquals(2, service.reset().get("fixtureMappingsRemoved"));
    assertEquals(0, service.reset().get("fixtureMappingsRemoved"));
    assertNull(jdbc.queryForObject("SELECT max(fineract_client_id) FROM customer_identity WHERE subject='fixture-alice'", Long.class));
    assertNotNull(jdbc.queryForObject("SELECT fineract_client_id FROM customer_identity WHERE subject='keycloak-customer-001'", Long.class));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM transfer_order", Integer.class));
    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM security_audit_event", Integer.class));
  }
}
