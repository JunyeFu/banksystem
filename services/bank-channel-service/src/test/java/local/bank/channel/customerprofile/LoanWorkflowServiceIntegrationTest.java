package local.bank.channel.customerprofile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractLoanPort;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.CoreWriteRepository;
import local.bank.channel.payments.EodRepository;
import local.bank.channel.identity.CustomerIdentityRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.server.ResponseStatusException;

class LoanWorkflowServiceIntegrationTest {
  private static EmbeddedPostgres postgres;
  private JdbcTemplate jdbc;
  private FineractLoanPort fineract;
  private LoanWorkflowService service;
  private EodRepository eod;

  @BeforeAll
  static void startPostgres() throws java.io.IOException { postgres = EmbeddedPostgres.start(); }

  @AfterAll
  static void stopPostgres() throws java.io.IOException { if (postgres != null) postgres.close(); }

  @BeforeEach
  void setUp() {
    var dataSource = postgres.getPostgresDatabase();
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("DROP TABLE IF EXISTS loan_document,loan_approval,loan_application,customer_identity CASCADE");
    jdbc.execute("DROP TABLE IF EXISTS eod_run CASCADE");
    jdbc.execute("CREATE TABLE eod_run(status text)");
    eod = new EodRepository(jdbc, dataSource);
    jdbc.execute("""
        CREATE TABLE loan_application(
          application_id uuid PRIMARY KEY,subject varchar(128) NOT NULL,fineract_client_id bigint,
          requested_amount numeric(19,2) NOT NULL,term_months integer NOT NULL,purpose varchar(240) NOT NULL,
          status varchar(32) NOT NULL,core_loan_id bigint,core_idempotency_key varchar(128),score integer,
          scoring_reason varchar(240),version bigint NOT NULL DEFAULT 1,repayment_method varchar(64) NOT NULL,
          customer_note varchar(240),quoted_annual_interest_rate numeric(8,4) NOT NULL,
          approved_annual_interest_rate numeric(8,4),approved_amount numeric(19,2),
          created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())
        """);
    jdbc.execute("""
        CREATE TABLE loan_document(document_id uuid PRIMARY KEY,application_id uuid NOT NULL REFERENCES loan_application,
          subject varchar(128) NOT NULL,document_type varchar(64) NOT NULL,storage_ref varchar(240) NOT NULL,
          status varchar(32) NOT NULL DEFAULT 'RECEIVED',created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),version bigint NOT NULL DEFAULT 0)
        """);
    jdbc.execute("""
        CREATE TABLE loan_approval(approval_id uuid PRIMARY KEY,application_id uuid NOT NULL REFERENCES loan_application,
          maker_subject varchar(128) NOT NULL,checker_subject varchar(128),status varchar(24) NOT NULL,
          reason varchar(240) NOT NULL,version bigint NOT NULL DEFAULT 1,application_version bigint NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())
        """);
    jdbc.execute("CREATE UNIQUE INDEX uq_loan_approval_pending_test ON loan_approval(application_id) WHERE status='PENDING'");
    jdbc.execute("CREATE TABLE customer_identity(subject varchar(128) NOT NULL,fineract_client_id bigint NOT NULL)");
    jdbc.update("INSERT INTO customer_identity(subject,fineract_client_id) VALUES (?,?)", "customer-1", 41L);
    fineract = mock(FineractLoanPort.class);
    FineractOperationsPort operations = mock(FineractOperationsPort.class);
    when(operations.postingDate()).thenReturn(LocalDate.of(2026, 9, 23));
    when(fineract.submitLoan(any(FineractLoanPort.LoanSubmissionCommand.class), org.mockito.ArgumentMatchers.endsWith(":loan-core-key-0001")))
        .thenReturn(new FineractLoanPort.LoanSubmission(91L));
    service = new LoanWorkflowService(new LoanRepository(jdbc), new CustomerIdentityRepository(jdbc),
        fineract, operations, new DataSourceTransactionManager(dataSource), 1L, "CNY", new BigDecimal("4.35"),
        new CoreWriteRepository(dataSource));
  }

  @Test
  void enforcesCompleteStateMachineMakerCheckerAndExactlyOnceCoreSubmit() {
    Map<String, Object> draft = service.createDraft("customer-1",
        new LoanWorkflowService.DraftRequest(new BigDecimal("30000.00"), 12, "经营周转", "EQUAL_INSTALLMENTS", "真实申请"));
    UUID applicationId = UUID.fromString((String) draft.get("applicationId"));
    assertEquals("DRAFT", draft.get("status"));

    Map<String, Object> document = service.addDocument("customer-1", applicationId, "INCOME_PROOF");
    String storageRef = jdbc.queryForObject("SELECT storage_ref FROM loan_document WHERE document_id=?", String.class,
        UUID.fromString((String) document.get("documentId")));
    assertTrue(storageRef.startsWith("channel://loan-applications/"));

    Map<String, Object> submitted = service.submit("customer-1", applicationId, 1);
    assertEquals("SUBMITTED", submitted.get("status"));
    assertEquals(2L, submitted.get("version"));
    assertThrows(ResponseStatusException.class, () -> service.submit("customer-1", applicationId, 1));

    Map<String, Object> scored = service.score(applicationId, 2);
    assertEquals("SCORED", scored.get("status"));
    assertEquals(3L, scored.get("version"));
    Map<String, Object> approval = service.requestApproval(applicationId, "maker-1", 3, "资料完整");
    UUID approvalId = UUID.fromString((String) approval.get("approvalId"));
    assertThrows(ResponseStatusException.class, () -> service.requestApproval(applicationId, "maker-2", 3, "重复送审"));
    assertThrows(ResponseStatusException.class, () -> service.approve(approvalId, "maker-1", 1,
        new LoanWorkflowService.ApprovalDecision(new BigDecimal("30000.00"), new BigDecimal("4.35"), "自批")));

    Map<String, Object> approved = service.approve(approvalId, "checker-1", 1,
        new LoanWorkflowService.ApprovalDecision(new BigDecimal("30000.00"), new BigDecimal("4.35"), "批准"));
    assertEquals("APPROVED", approved.get("status"));
    Map<String, Object> core = service.submitToCore(applicationId, "loan-core-key-0001");
    assertEquals("CORE_SUBMITTED", core.get("status"));
    assertEquals(91L, core.get("coreLoanId"));
    assertEquals(core, service.submitToCore(applicationId, "loan-core-key-0001"));
    assertEquals(409,assertThrows(ResponseStatusException.class,
        ()->service.submitToCore(applicationId,"different-key")).getStatusCode().value());
    verify(fineract, times(1)).submitLoan(any(FineractLoanPort.LoanSubmissionCommand.class), eq(applicationId+":loan-core-key-0001"));
  }

  @Test
  void aPreviouslyClaimedSubmissionOnlyReadsBackInsteadOfPostingAgain() {
    Map<String,Object> draft=service.createDraft("customer-1",new LoanWorkflowService.DraftRequest(
        new BigDecimal("1000"),12,"消费","EQUAL_INSTALLMENTS",null));
    UUID id=UUID.fromString((String)draft.get("applicationId"));
    jdbc.update("UPDATE loan_application SET status='APPROVED',approved_amount=1000,approved_annual_interest_rate=4.35,core_idempotency_key=? WHERE application_id=?",
        "loan-core-key-0001",id);
    assertThrows(ResponseStatusException.class,()->service.submitToCore(id,"loan-core-key-0001"));
    verify(fineract,times(0)).submitLoan(any(),any());
    when(fineract.findSubmittedLoan(eq(41L),eq(id+":loan-core-key-0001"),any()))
        .thenReturn(java.util.Optional.of(new FineractLoanPort.LoanSubmission(91L)));
    assertEquals(91L,service.submitToCore(id,"loan-core-key-0001").get("coreLoanId"));
    verify(fineract,times(0)).submitLoan(any(),any());
  }

  @Test
  void coreSubmissionCannotClaimOrPostDuringEod() {
    UUID id = approvedApplication();
    try (var lock = eod.lock(LocalDate.of(2026, 9, 23))) {
      org.junit.jupiter.api.Assertions.assertNotNull(lock);
      assertEquals(409, assertThrows(ResponseStatusException.class,
          () -> service.submitToCore(id, "loan-core-key-0001")).getStatusCode().value());
    }
    org.junit.jupiter.api.Assertions.assertNull(jdbc.queryForObject(
        "SELECT core_idempotency_key FROM loan_application WHERE application_id=?", String.class, id));
    verify(fineract, times(0)).submitLoan(any(), any());
  }

  @Test
  void coreSubmissionHoldsBarrierAcrossNetworkAndReleasesItOnFailure() {
    UUID id = approvedApplication();
    when(fineract.submitLoan(any(), any())).thenAnswer(invocation -> {
      org.junit.jupiter.api.Assertions.assertNull(eod.lock(LocalDate.of(2026, 9, 23)));
      throw new org.springframework.web.client.ResourceAccessException("response lost");
    });
    assertThrows(org.springframework.web.client.ResourceAccessException.class,
        () -> service.submitToCore(id, "loan-core-key-0001"));
    try (var lock = eod.lock(LocalDate.of(2026, 9, 23))) {
      org.junit.jupiter.api.Assertions.assertNotNull(lock);
    }
    assertEquals("loan-core-key-0001", jdbc.queryForObject(
        "SELECT core_idempotency_key FROM loan_application WHERE application_id=?", String.class, id));
    assertThrows(ResponseStatusException.class, () -> service.submitToCore(id, "loan-core-key-0001"));
    verify(fineract, times(1)).submitLoan(any(), any());
  }

  private UUID approvedApplication() {
    UUID id = UUID.fromString((String) service.createDraft("customer-1",
        new LoanWorkflowService.DraftRequest(new BigDecimal("1000"), 12, "消费", "EQUAL_INSTALLMENTS", null)).get("applicationId"));
    jdbc.update("UPDATE loan_application SET status='APPROVED',approved_amount=1000,approved_annual_interest_rate=4.35 WHERE application_id=?", id);
    return id;
  }

  @Test
  void rejectsOutOfOrderAndUncontrolledRepaymentMethod() {
    assertThrows(ResponseStatusException.class, () -> service.createDraft("customer-1",
        new LoanWorkflowService.DraftRequest(new BigDecimal("1000"), 12, "消费", "UNKNOWN", null)));
    Map<String, Object> draft = service.createDraft("customer-1",
        new LoanWorkflowService.DraftRequest(new BigDecimal("1000"), 12, "消费", "EQUAL_PRINCIPAL", null));
    UUID id = UUID.fromString((String) draft.get("applicationId"));
    assertThrows(ResponseStatusException.class, () -> service.score(id, 1));
    assertThrows(ResponseStatusException.class, () -> service.addDocument("other-customer", id, "INCOME_PROOF"));
  }
}
