package local.bank.channel.payments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.FineractTransferPort.CoreTransferOutcomeUnknownException;
import local.bank.channel.FineractTransferPort.CoreTransferRejectedException;
import local.bank.channel.audit.AuditService;
import local.bank.channel.notifications.NotificationRepository;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.risk.RiskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

class TransferProcessorTest {
  private JdbcTemplate jdbc;
  private FineractTransferPort fineract;
  private TestTransactions transactions;
  private TransferProcessor processor;
  private final ArrayDeque<RowData> rowSequence = new ArrayDeque<>();

  @BeforeEach
  void setUp() {
    jdbc = mock(JdbcTemplate.class);
    fineract = mock(FineractTransferPort.class);
    transactions = new TestTransactions();
    when(jdbc.query(startsWith("SELECT source_account_id"),
        org.mockito.ArgumentMatchers.<RowMapper<Object>>any(), any(UUID.class)))
        .thenAnswer(invocation -> {
          RowData data = rowSequence.removeFirst();
          ResultSet resultSet = mock(ResultSet.class);
          when(resultSet.getLong(1)).thenReturn(101L);
          when(resultSet.getLong(2)).thenReturn(202L);
          when(resultSet.getBigDecimal(3)).thenReturn(new BigDecimal("100.00"));
          when(resultSet.getString(4)).thenReturn("CNY");
          when(resultSet.getString(5)).thenReturn(data.status());
          when(resultSet.getString(6)).thenReturn("idempotency-key-0001");
          when(resultSet.getString(7)).thenReturn("customer-subject-001");
          when(resultSet.getString(8)).thenReturn("bank-golden-correlation-001");
          when(resultSet.getObject(9)).thenReturn(data.submissionStarted() ? new Object() : null);
          when(resultSet.getString(10)).thenReturn(data.coreReference());
          RowMapper<?> mapper = invocation.getArgument(1);
          return List.of(mapper.mapRow(resultSet, 0));
        });
    processor = new TransferProcessor(new TransferProcessingRepository(jdbc), new TransferReceiptRepository(jdbc),
        new NotificationRepository(jdbc), fineract, mock(AuditService.class),
        mock(TransferStateMachine.class), transactions, allowedRisk());
  }

  private RiskService allowedRisk() {
    RiskService risk=mock(RiskService.class);
    when(risk.evaluate(any(UUID.class),any(BigDecimal.class),anyString()))
        .thenReturn(Map.of("decisionId",UUID.randomUUID().toString(),"decision","ALLOW","reason","test","version",1));
    return risk;
  }

  @Test
  void confirmedCoreReadbackCreatesAccountingProjection() {
    UUID transferId = UUID.randomUUID();
    BigDecimal amount = new BigDecimal("100.00");
    rows(row("PENDING_CORE_POSTING", false), row("PENDING_CLEARING", true));
    when(jdbc.update(startsWith("UPDATE transfer_order SET core_submission_started_at"), eq(transferId))).thenReturn(1);
    when(fineract.accountTransfer(101L, 202L, amount, "CNY", "idempotency-key-0001"))
        .thenReturn(new FineractTransferPort.Submission(7001L));
    when(fineract.findAccountTransfer("idempotency-key-0001", 7001L, 101L, 202L, amount))
        .thenReturn(Optional.of(core(7001L)));

    Map<String, Object> result = processor.process(transferId);

    assertEquals("SETTLED", result.get("status"));
    assertEquals("7001", result.get("coreReference"));
    verify(fineract).findAccountTransfer("idempotency-key-0001", 7001L, 101L, 202L, amount);
    verify(jdbc).update(startsWith("INSERT INTO transfer_accounting_projection"), any(UUID.class), eq(101L),
        eq(amount), eq(BigDecimal.ZERO), eq("bank-golden-correlation-001"), eq(transferId));
    verify(jdbc).update(startsWith("INSERT INTO transfer_accounting_projection"), any(UUID.class), eq(202L),
        eq(BigDecimal.ZERO), eq(amount), eq("bank-golden-correlation-001"), eq(transferId));
  }

  @Test
  void lostResponseBecomesUnknownAndReentryNeverPostsAgain() {
    UUID transferId = UUID.randomUUID();
    BigDecimal amount = new BigDecimal("100.00");
    rows(row("PENDING_CORE_POSTING", false), row("PENDING_CLEARING", true),
        row("CORE_RESULT_UNKNOWN", true), row("CORE_RESULT_UNKNOWN", true));
    when(jdbc.update(startsWith("UPDATE transfer_order SET core_submission_started_at"), eq(transferId))).thenReturn(1);
    when(fineract.accountTransfer(any(Long.class), any(Long.class), eq(amount), eq("CNY"), anyString()))
        .thenThrow(new CoreTransferOutcomeUnknownException("response lost"));
    when(fineract.findAccountTransfer("idempotency-key-0001", null, 101L, 202L, amount))
        .thenReturn(Optional.empty());

    assertEquals("CORE_RESULT_UNKNOWN", processor.process(transferId).get("status"));
    assertEquals("CORE_RESULT_UNKNOWN", processor.process(transferId).get("status"));

    verify(fineract, times(1)).accountTransfer(any(Long.class), any(Long.class), eq(amount), eq("CNY"), anyString());
    verify(fineract, times(2)).findAccountTransfer("idempotency-key-0001", null, 101L, 202L, amount);
  }

  @Test
  void explicitRejectionFailsOnlyAfterEmptyReadback() {
    UUID transferId = UUID.randomUUID();
    BigDecimal amount = new BigDecimal("100.00");
    rows(row("PENDING_CORE_POSTING", false), row("PENDING_CLEARING", true));
    when(jdbc.update(startsWith("UPDATE transfer_order SET core_submission_started_at"), eq(transferId))).thenReturn(1);
    when(fineract.accountTransfer(any(Long.class), any(Long.class), eq(amount), eq("CNY"), anyString()))
        .thenThrow(new CoreTransferRejectedException(400, "ignored"));
    when(fineract.findAccountTransfer("idempotency-key-0001", null, 101L, 202L, amount))
        .thenReturn(Optional.empty());

    assertEquals("FAILED", processor.process(transferId).get("status"));
    verify(fineract).findAccountTransfer("idempotency-key-0001", null, 101L, 202L, amount);
  }

  @Test
  void localProjectionFailureDoesNotCauseSecondCoreDebit() {
    UUID transferId = UUID.randomUUID();
    BigDecimal amount = new BigDecimal("100.00");
    rows(row("PENDING_CORE_POSTING", false), row("PENDING_CLEARING", true),
        row("PENDING_CLEARING", true), row("PENDING_CLEARING", true));
    when(jdbc.update(startsWith("UPDATE transfer_order SET core_submission_started_at"), eq(transferId))).thenReturn(1);
    when(fineract.accountTransfer(any(Long.class), any(Long.class), eq(amount), eq("CNY"), anyString()))
        .thenReturn(new FineractTransferPort.Submission(7001L));
    when(fineract.findAccountTransfer("idempotency-key-0001", 7001L, 101L, 202L, amount))
        .thenReturn(Optional.of(core(7001L)));
    when(fineract.findAccountTransfer("idempotency-key-0001", null, 101L, 202L, amount))
        .thenReturn(Optional.of(core(7001L)));
    transactions.failNextSettlement();

    assertThrows(IllegalStateException.class, () -> processor.process(transferId));
    assertEquals("SETTLED", processor.process(transferId).get("status"));

    verify(fineract, times(1)).accountTransfer(any(Long.class), any(Long.class), eq(amount), eq("CNY"), anyString());
  }

  @Test
  void terminalTransferIsNotPostedAgain() {
    rows(row("SETTLED", true));
    assertEquals("SETTLED", processor.process(UUID.randomUUID()).get("status"));
    verify(fineract, never()).accountTransfer(any(Long.class), any(Long.class), any(), anyString(), anyString());
  }

  @Test
  void reviewRiskStopsBeforeCoreSubmission() {
    UUID transferId=UUID.randomUUID();
    rows(row("CREATED",false));
    RiskService review=mock(RiskService.class);
    when(review.evaluate(eq(transferId),eq(new BigDecimal("100.00")),eq("customer-subject-001")))
        .thenReturn(Map.of("decisionId",UUID.randomUUID().toString(),"decision","REVIEW","reason","review","version",1));
    processor=new TransferProcessor(new TransferProcessingRepository(jdbc),new TransferReceiptRepository(jdbc),
        new NotificationRepository(jdbc),fineract,mock(AuditService.class),mock(TransferStateMachine.class),transactions,review);

    assertEquals("RISK_REVIEW",processor.process(transferId).get("status"));
    verify(fineract,never()).accountTransfer(any(Long.class),any(Long.class),any(),anyString(),anyString());
  }

  @Test
  void blockedRiskFailsBeforeCoreSubmission() {
    UUID transferId=UUID.randomUUID();
    rows(row("CREATED",false));
    RiskService blocked=mock(RiskService.class);
    when(blocked.evaluate(eq(transferId),eq(new BigDecimal("100.00")),eq("customer-subject-001")))
        .thenReturn(Map.of("decisionId",UUID.randomUUID().toString(),"decision","BLOCK","reason","blocked","version",1));
    processor=new TransferProcessor(new TransferProcessingRepository(jdbc),new TransferReceiptRepository(jdbc),
        new NotificationRepository(jdbc),fineract,mock(AuditService.class),mock(TransferStateMachine.class),transactions,blocked);

    assertEquals("FAILED",processor.process(transferId).get("status"));
    verify(fineract,never()).accountTransfer(any(Long.class),any(Long.class),any(),anyString(),anyString());
  }

  private void rows(RowData... values) {
    rowSequence.addAll(Arrays.asList(values));
  }

  private static RowData row(String status, boolean submissionStarted) {
    return new RowData(status, submissionStarted, null);
  }

  private static FineractTransferPort.VerifiedTransfer core(long id) {
    return new FineractTransferPort.VerifiedTransfer(id);
  }

  private record RowData(String status, boolean submissionStarted, String coreReference) {}

  private static final class TestTransactions implements TransactionOperations {
    private boolean failSettlement;

    void failNextSettlement() { failSettlement = true; }

    @Override
    public <T> T execute(TransactionCallback<T> action) {
      T value = action.doInTransaction(mock(TransactionStatus.class));
      if (failSettlement && value instanceof Map<?, ?> result && "SETTLED".equals(result.get("status"))) {
        failSettlement = false;
        throw new IllegalStateException("local commit failed");
      }
      return value;
    }
  }
}
