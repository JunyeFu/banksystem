package local.bank.channel.payments;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractAccountPort;
import local.bank.channel.audit.AuditService;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

class TransferContractTest {
  @Test
  void explicitBusinessCorrelationIsRequired() {
    ResponseStatusException error = assertThrows(ResponseStatusException.class,
        () -> TransferController.validateWrite("idempotency-key-0001", null,
            "101", "202", new BigDecimal("100.00"), "CNY"));

    assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    assertEquals("X-Correlation-Id is required", error.getReason());
  }

  @Test
  void idempotencyAndCorrelationRemainDistinctValidInputs() {
    assertDoesNotThrow(() -> TransferController.validateWrite(
        "idempotency-key-0001", "bank-golden-correlation-001",
        "101", "202", new BigDecimal("100.00"), "CNY"));
  }

  @Test
  void idempotencyScopeSeparatesSubjectsAndOperations() {
    assertEquals("customer-a:CUSTOMER_TRANSFER_CREATE:shared-key",
        TransferController.idempotencyScope("customer-a", "CUSTOMER_TRANSFER_CREATE", "shared-key"));
    org.junit.jupiter.api.Assertions.assertNotEquals(
        TransferController.idempotencyScope("customer-a", "CUSTOMER_TRANSFER_CREATE", "shared-key"),
        TransferController.idempotencyScope("customer-b", "CUSTOMER_TRANSFER_CREATE", "shared-key"));
    org.junit.jupiter.api.Assertions.assertNotEquals(
        TransferController.idempotencyScope("customer-a", "CUSTOMER_TRANSFER_CREATE", "shared-key"),
        TransferController.idempotencyScope("customer-a", "OPERATIONS_TRANSFER_CREATE", "shared-key"));
  }

  @Test
  void customerCannotConfirmAnotherSubjectsTransfer() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    TransferProcessor processor = mock(TransferProcessor.class);
    UUID transferId = UUID.randomUUID();
    when(jdbc.query(startsWith("SELECT 1 FROM transfer_order"),
        org.mockito.ArgumentMatchers.<RowMapper<Integer>>any(), eq(transferId), eq("customer-a")))
        .thenReturn(List.of());
    TransferController controller = controller(jdbc, processor);

    ResponseStatusException error = assertThrows(ResponseStatusException.class,
        () -> controller.confirmCustomer(jwt("customer-a"), transferId));

    assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    verify(processor, never()).process(any());
  }

  @Test
  void customerConfirmationProcessesAndReturnsOwnedReadModel() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    TransferProcessor processor = mock(TransferProcessor.class);
    UUID transferId = UUID.randomUUID();
    Map<String, Object> readModel = Map.of("transferId", transferId.toString(), "status", "SETTLED");
    when(jdbc.query(startsWith("SELECT 1 FROM transfer_order"),
        org.mockito.ArgumentMatchers.<RowMapper<Integer>>any(), eq(transferId), eq("customer-a")))
        .thenReturn(List.of(1));
    when(jdbc.query(startsWith("SELECT t.transfer_id"),
        org.mockito.ArgumentMatchers.<RowMapper<Map<String, Object>>>any(), eq(transferId), eq("customer-a")))
        .thenReturn(List.of(readModel));
    TransferController controller = controller(jdbc, processor);

    Map<String, Object> result = controller.confirmCustomer(jwt("customer-a"), transferId);

    assertEquals(readModel, result);
    verify(processor).process(transferId);
  }

  private static TransferController controller(JdbcTemplate jdbc, TransferProcessor processor) {
    return new TransferController(new TransferRepository(jdbc),
        new local.bank.channel.beneficiaries.BeneficiaryRepository(jdbc),
        new local.bank.channel.identity.CustomerIdentityRepository(jdbc),
        new ObjectMapper(), mock(FineractAccountPort.class),
        mock(AuditService.class), mock(TransferStateMachine.class), processor,
        mock(org.springframework.transaction.PlatformTransactionManager.class));
  }

  private static Jwt jwt(String subject) {
    return Jwt.withTokenValue("test").header("alg", "none").subject(subject).build();
  }
}
