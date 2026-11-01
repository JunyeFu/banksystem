package local.bank.channel.customerprofile;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import local.bank.channel.*;
import local.bank.channel.audit.AuditService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

class LoanOperationIntegrationTest {
  static EmbeddedPostgres pg;
  JdbcTemplate jdbc; LoanOperationRepository repository; FineractLoanPort core; AuditService audit;
  LoanOperationService service; UUID application;
  final LocalDate date=LocalDate.of(2026,10,2);
  @BeforeAll static void start() throws Exception {pg=EmbeddedPostgres.start();}
  @AfterAll static void stop() throws Exception {pg.close();}
  @BeforeEach void setup() {
    var ds=pg.getPostgresDatabase();jdbc=new JdbcTemplate(ds);
    jdbc.execute("DROP TABLE IF EXISTS loan_core_operation,outbox_event,loan_application CASCADE");
    jdbc.execute("CREATE TABLE loan_application(application_id uuid PRIMARY KEY,status text,core_idempotency_key text,core_loan_id bigint,version bigint default 1,updated_at timestamptz default now())");
    jdbc.execute("CREATE TABLE outbox_event(id uuid PRIMARY KEY,aggregate_type text,aggregate_id uuid,event_type text,event_version int,payload jsonb,headers jsonb,status text)");
    // Execute the production migration SQL so constraints are exercised, not copied into a test substitute.
    {
      var yaml=new org.yaml.snakeyaml.Yaml().loadAs(getClass().getResourceAsStream("/db/changelog/v16-loan-core-operation.yaml"),Map.class);
      var change=(Map<?,?>)((Map<?,?>)((List<?>)yaml.get("databaseChangeLog")).getFirst()).get("changeSet");
      String sql=(String)((Map<?,?>)((Map<?,?>)((List<?>)change.get("changes")).getFirst()).get("sql")).get("sql");
      jdbc.execute("ALTER TABLE outbox_event ADD COLUMN transfer_id uuid NOT NULL");
      jdbc.execute(sql);
    }
    application=UUID.randomUUID();jdbc.update("INSERT INTO loan_application(application_id,status) VALUES (?,'DISBURSED')",application);
    repository=new LoanOperationRepository(jdbc);core=mock(FineractLoanPort.class);audit=mock(AuditService.class);
    var loans=mock(LoanRepository.class);when(loans.coreLoanFor("owner",application)).thenReturn(7L);
    var operations=mock(FineractOperationsPort.class);when(operations.postingDate()).thenReturn(date);
    service=new LoanOperationService(loans,repository,core,operations,audit,new ObjectMapper(),new DataSourceTransactionManager(ds),mock(CoreWriteRepository.class));
  }
  @Test void unknownIsReadBackWithoutSecondSubmissionAndChangedAmountConflicts() {
    when(core.loanTransaction(eq(7L),eq("repayment"),eq(BigDecimal.TEN),eq(date),anyString())).thenThrow(new ResourceAccessException("connection lost"));
    when(core.findTransaction(eq(7L),eq("repayment"),eq(BigDecimal.TEN),eq(date),anyString())).thenReturn(Optional.empty());
    assertThrows(ResponseStatusException.class,()->service.execute("owner",application,"key","repayment",BigDecimal.TEN));
    assertEquals("UNKNOWN",repository.find(application,"key").status());
    assertThrows(ResponseStatusException.class,()->service.execute("owner",application,"key","repayment",BigDecimal.ONE));
    var payload=new ObjectMapper().valueToTree(Map.of("resourceId",90,"loanId",7));
    when(core.findTransaction(eq(7L),eq("repayment"),eq(BigDecimal.TEN),eq(date),anyString())).thenReturn(Optional.of(new FineractLoanPort.LoanActionResult(payload)));
    var result=service.execute("owner",application,"key","repayment",BigDecimal.TEN);
    assertEquals(result,service.execute("owner",application,"key","repayment",BigDecimal.TEN));
    verify(core,times(1)).loanTransaction(anyLong(),anyString(),any(),any(),anyString());
    assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM outbox_event",Integer.class));
    assertEquals(0,repository.pendingForEod());
  }
  @Test void concurrentClaimsHaveOneWinner() throws Exception {
    try(var pool=Executors.newFixedThreadPool(4)) {
      var tasks=new ArrayList<Future<Boolean>>();
      for(int i=0;i<8;i++)tasks.add(pool.submit(()->repository.claim(UUID.randomUUID(),application,"same","repayment",BigDecimal.TEN,date,"corr")));
      int winners=0;for(var task:tasks)if(task.get())winners++;
      assertEquals(1,winners);
    }
  }
  @Test void auditFailureRollsBackCompletionAndOutbox() {
    var payload=new ObjectMapper().valueToTree(Map.of("resourceId",90));
    when(core.findTransaction(anyLong(),anyString(),any(),any(),anyString())).thenReturn(Optional.of(new FineractLoanPort.LoanActionResult(payload)));
    doThrow(new IllegalStateException("audit unavailable")).when(audit).record(anyString(),anyString(),anyString(),anyString(),anyString(),anyString(),anyString(),isNull(),anyMap());
    assertThrows(IllegalStateException.class,()->service.execute("owner",application,"key","repayment",BigDecimal.TEN));
    assertEquals("CLAIMED",repository.find(application,"key").status());
    assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM outbox_event",Integer.class));
  }
}
