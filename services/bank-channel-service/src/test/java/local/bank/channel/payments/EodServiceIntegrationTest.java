package local.bank.channel.payments;
import local.bank.channel.operations.EodCoordinator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Map;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.audit.AuditService;
import local.bank.channel.reconciliation.ReconciliationService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

class EodServiceIntegrationTest {
  private static final LocalDate DATE = LocalDate.of(2026, 9, 22);
  private static EmbeddedPostgres postgres;

  private JdbcTemplate jdbc;
  private FineractOperationsPort fineract;
  private ReconciliationService reconciliation;
  private EodCoordinator service;

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
    jdbc.execute("DROP TABLE IF EXISTS eod_run_step");
    jdbc.execute("DROP TABLE IF EXISTS eod_run");
    jdbc.execute("DROP TABLE IF EXISTS transfer_order");
    jdbc.execute("CREATE TABLE transfer_order(transfer_id uuid PRIMARY KEY,status varchar(32) NOT NULL)");
    jdbc.execute("""
        CREATE TABLE eod_run(
          run_id uuid PRIMARY KEY,business_date date NOT NULL,status varchar(24) NOT NULL,
          reconciliation_status varchar(24) NOT NULL,reason varchar(240),idempotency_key varchar(128) UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version bigint NOT NULL DEFAULT 0)
        """);
    jdbc.execute("CREATE UNIQUE INDEX uq_eod_active_business_date ON eod_run(business_date) WHERE status IN ('RUNNING','INTERRUPTED','COMPLETED')");
    jdbc.execute("""
        CREATE TABLE eod_run_step(run_id uuid NOT NULL REFERENCES eod_run(run_id),step_name varchar(64) NOT NULL,
          completed_at timestamptz NOT NULL DEFAULT now(),core_job_version bigint,PRIMARY KEY(run_id,step_name))
        """);
    fineract = mock(FineractOperationsPort.class);
    reconciliation = mock(ReconciliationService.class);
    AuditService audit = mock(AuditService.class);
    when(fineract.businessDate()).thenReturn(DATE);
    when(fineract.checkHealth()).thenReturn(true);
    when(fineract.jobCompletedAfter(org.mockito.ArgumentMatchers.anyInt(),org.mockito.ArgumentMatchers.anyLong())).thenReturn(true);
    matchedReconciliation();
    service = new EodCoordinator(new EodRepository(jdbc,dataSource),new TransferRepository(jdbc),fineract,reconciliation,audit,
        new DataSourceTransactionManager(dataSource),mock(local.bank.channel.customerprofile.LoanOperationRepository.class));
  }

  @AfterEach
  void clean() {
    jdbc.execute("DELETE FROM eod_run_step");
    jdbc.execute("DELETE FROM eod_run");
  }

  @Test
  void aKeyCannotResumeAnotherBusinessDate() {
    java.util.UUID runId=java.util.UUID.randomUUID();
    jdbc.update("INSERT INTO eod_run(run_id,business_date,status,reconciliation_status,idempotency_key) VALUES(?,?,'INTERRUPTED','BLOCKED',?)",
        runId,DATE,"date-bound-key-0001");
    var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,
        ()->service.run(DATE.plusDays(1),"date-bound-key-0001"));
    assertEquals(409,error.getStatusCode().value());
    verify(fineract,times(0)).runCobBatch();
    assertEquals("INTERRUPTED",jdbc.queryForObject("SELECT status FROM eod_run WHERE run_id=?",String.class,runId));
    assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM eod_run_step",Integer.class));
  }

  @Test
  void completesNormalRunAndAdvancesOnlyAfterMatchedReconciliation() {
    Map<String, Object> result = service.run(DATE, "rf051-normal-key-0001");

    assertEquals("COMPLETED", result.get("status"));
    assertEquals(EodCoordinator.STEPS.size(), ((java.util.List<?>) result.get("stepsCompleted")).size());
    verify(fineract).advanceBusinessDate(DATE.plusDays(1));
  }

  @Test
  void differenceBlocksDateAndNewKeyCanRunAfterResolution() {
    when(reconciliation.runForEod(anyString(), any(), any())).thenAnswer(invocation ->
        "CHANNEL_TO_CORE".equals(invocation.getArgument(0))
            ? Map.of("status", "DIFFERENCE") : Map.of("status", "MATCHED"));

    Map<String, Object> failed = service.run(DATE, "rf051-difference-key-01");
    assertEquals("FAILED", failed.get("status"));
    verify(fineract, times(0)).advanceBusinessDate(any());

    matchedReconciliation();
    Map<String, Object> recovered = service.run(DATE, "rf051-difference-key-02");
    assertEquals("COMPLETED", recovered.get("status"));
    verify(fineract).advanceBusinessDate(DATE.plusDays(1));
  }

  @Test
  void interruptionResumeDoesNotRepeatSuccessfulCoreJobs() {
    doThrow(new IllegalStateException("worker interrupted"))
        .doNothing().when(fineract).postInterestOnSavings();

    Map<String, Object> interrupted = service.run(DATE, "rf051-interrupt-key-01");
    assertEquals("INTERRUPTED", interrupted.get("status"));
    when(fineract.jobCompletedAfter(6,0)).thenReturn(false);
    Map<String, Object> resumed = service.run(DATE, "rf051-interrupt-key-01");
    assertEquals("INTERRUPTED", resumed.get("status"));

    verify(fineract, times(1)).runCobBatch();
    verify(fineract, times(1)).applyAnnualFeeForSavings();
    verify(fineract, times(1)).postInterestOnSavings();
    verify(fineract, times(0)).advanceBusinessDate(DATE.plusDays(1));
    when(fineract.jobCompletedAfter(6,0)).thenReturn(true);
    assertEquals("COMPLETED",service.run(DATE,"rf051-interrupt-key-01").get("status"));
    verify(fineract,times(1)).postInterestOnSavings();
    verify(fineract,times(1)).advanceBusinessDate(DATE.plusDays(1));
  }

  private void matchedReconciliation() {
    when(reconciliation.runForEod(anyString(), any(), any())).thenReturn(Map.of("status", "MATCHED"));
    when(reconciliation.runForEod(anyString(), any(), any(), anyString())).thenReturn(Map.of("status", "MATCHED"));
  }
}
