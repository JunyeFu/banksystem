package local.bank.channel.reconciliation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.FineractOperationsPort;
import com.fasterxml.jackson.databind.ObjectMapper;

class ReconciliationPersistenceIntegrationTest {
  @Test void secondDifferenceFailureRollsBackRunAndFirstDifference() throws Exception {
    try(var pg=EmbeddedPostgres.start()) {
      var ds=pg.getPostgresDatabase();var jdbc=new JdbcTemplate(ds);
      UUID rejected=UUID.randomUUID();
      jdbc.execute("CREATE TABLE reconciliation_run(run_id uuid PRIMARY KEY,reconciliation_type text,status text,difference_count int,details jsonb,eod_run_id uuid,business_date date,phase text)");
      jdbc.execute("CREATE TABLE reconciliation_difference(difference_id uuid,run_id uuid REFERENCES reconciliation_run,transaction_id uuid CHECK(transaction_id <> '"+rejected+"'),field_name text,expected_value text,actual_value text)");
      var repository=spy(new ReconciliationRepository(jdbc));
      doReturn(List.of(new ReconciliationRepository.TransferFact(UUID.randomUUID(),"a",1,2,BigDecimal.ONE,"CNY",null),
          new ReconciliationRepository.TransferFact(rejected,"b",1,2,BigDecimal.ONE,"CNY",null))).when(repository).transferFacts();
      var service=new ReconciliationService(repository,mock(FineractTransferPort.class),new ObjectMapper(),
          new DataSourceTransactionManager(ds),mock(FineractOperationsPort.class),mock(local.bank.channel.FineractAccountPort.class));
      assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->service.run("CHANNEL_TO_CORE"));
      assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM reconciliation_run",Integer.class));
      assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM reconciliation_difference",Integer.class));
    }
  }
}
