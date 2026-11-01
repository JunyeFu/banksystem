package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FineractReconciliationTest {
  @Test
  void matchesTransactionReferenceAccountsAmountAndCurrency() {
    Map<String, Object> transfer = Map.of(
        "transferDescription", FineractTransferPort.transferDescription("subject:transfer:key-1234567890"),
        "fromAccount", Map.of("id", 11L),
        "toAccount", Map.of("id", 22L),
        "transferAmount", "100.00",
        "currency", Map.of("code", "CNY"),
        "reversed", false);

    assertTrue(FineractTransferPort.matchesAccountTransfer(transfer,
        "subject:transfer:key-1234567890", 11L, 22L, new BigDecimal("100.00"), "CNY"));
    assertFalse(FineractTransferPort.matchesAccountTransfer(transfer,
        "subject:transfer:key-1234567890", 11L, 22L, new BigDecimal("100.00"), "USD"));
    assertFalse(FineractTransferPort.matchesAccountTransfer(transfer,
        "subject:transfer:key-1234567890", 11L, 22L, new BigDecimal("99.00"), "CNY"));
  }
}
