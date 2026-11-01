package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FineractTransferReadbackTest {
  @Test
  void matchesOnlyTheSameBusinessOperation() {
    Map<String, Object> transfer = Map.of(
        "transferDescription", FineractTransferPort.transferDescription("idempotency-key-0001"),
        "transferAmount", new BigDecimal("100.00"),
        "reversed", false,
        "fromAccount", Map.of("id", 101L),
        "toAccount", Map.of("id", 202L));

    assertTrue(FineractTransferPort.matchesAccountTransfer(
        transfer, "idempotency-key-0001", 101L, 202L, new BigDecimal("100.00")));
    assertFalse(FineractTransferPort.matchesAccountTransfer(
        transfer, "idempotency-key-0001", 101L, 203L, new BigDecimal("100.00")));
    assertFalse(FineractTransferPort.matchesAccountTransfer(
        transfer, "different-idempotency-key", 101L, 202L, new BigDecimal("100.00")));
  }
}
