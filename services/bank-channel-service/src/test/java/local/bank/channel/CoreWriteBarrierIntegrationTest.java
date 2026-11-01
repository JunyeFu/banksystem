package local.bank.channel;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.LocalDate;
import java.util.UUID;
import local.bank.channel.payments.EodRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class CoreWriteBarrierIntegrationTest {
  @Test void sharedMoneyCommandsAndExclusiveEodCannotOverlap() throws Exception {
    try (var postgres = EmbeddedPostgres.start()) {
      var source = postgres.getPostgresDatabase();
      var jdbc = new JdbcTemplate(source);
      jdbc.execute("CREATE TABLE eod_run(status text)");
      var writes = new CoreWriteRepository(source);
      var eod = new EodRepository(jdbc, source);
      try (var first = writes.acquire(); var second = writes.acquire()) {
        assertNull(eod.lock(LocalDate.of(2026, 10, 2)));
      }
      try (var exclusive = eod.lock(LocalDate.of(2026, 10, 2))) {
        assertNotNull(exclusive);
        var rejection = assertThrows(ResponseStatusException.class, writes::acquire);
        assertEquals(409, rejection.getStatusCode().value());
      }
      jdbc.update("INSERT INTO eod_run VALUES ('INTERRUPTED')");
      assertThrows(ResponseStatusException.class, writes::acquire);
      jdbc.update("UPDATE eod_run SET status = 'COMPLETED'");
      try (var resumed = writes.acquire()) { assertNotNull(resumed); }
      // Rejected acquisitions released their session locks and connections.
      try (var exclusive = eod.lock(LocalDate.of(2026, 10, 3))) { assertNotNull(exclusive); }
    }
  }
}
