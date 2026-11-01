package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FineractAccountPortTest {
  @Test
  void localizesCoreAccountAliasesAndMoney() {
    var account = FineractAccountPort.account(Map.of(
        "savingsAccountId", 42, "clientId", 11, "accountNumber", "621800005302",
        "currency", Map.of("code", "CNY"), "summary", Map.of("accountBalance", "128560.341"),
        "status", Map.of("code", "savingsAccountStatusType.active", "value", "ACTIVE"),
        "timeline", Map.of("activatedOnDate", List.of(2025, 1, 15))));
    assertEquals(42L, account.id());
    assertEquals(11L, account.clientId());
    assertEquals("CNY", account.currency());
    assertEquals("128560.34", account.balance().toPlainString());
    assertEquals("ACTIVE", account.status());
    assertEquals(java.time.LocalDate.of(2025, 1, 15), account.openedOn());
    assertNull(FineractAccountPort.account(Map.of("id", 43)).balance());
  }

  @Test
  void localizesCoreTransactionDirectionAndCurrencyFallback() {
    var transaction = FineractAccountPort.transaction(Map.of(
        "id", 7, "date", List.of(2026, 7, 15),
        "transactionType", Map.of("value", "Withdrawal", "withdrawal", true),
        "amount", "-12.50", "runningBalance", "80.00"), "CNY");
    assertEquals("DEBIT", transaction.type());
    assertEquals("CNY", transaction.currency());
    assertEquals("-12.50", transaction.amount().toPlainString());
    assertEquals("2026-07-15", transaction.date());
  }
  @Test
  void resolvesTheSingleExactSavingsAccount() {
    long id = FineractAccountPort.selectSavingsAccountId(List.of(
        Map.of("entityId", 42L, "entityAccountNo", "000123"),
        Map.of("entityId", 43L, "entityAccountNo", "000124")), "000123");
    assertEquals(42L, id);
  }

  @Test
  void rejectsMissingSavingsAccount() {
    assertThrows(IllegalArgumentException.class,
        () -> FineractAccountPort.selectSavingsAccountId(List.of(), "000123"));
  }

  @Test
  void rejectsAmbiguousSavingsAccount() {
    var matches = List.of(
        Map.<String, Object>of("entityId", 42L, "entityAccountNo", "000123"),
        Map.<String, Object>of("entityId", 43L, "entityAccountNo", "000123"));
    assertThrows(IllegalArgumentException.class,
        () -> FineractAccountPort.selectSavingsAccountId(matches, "000123"));
  }
}
