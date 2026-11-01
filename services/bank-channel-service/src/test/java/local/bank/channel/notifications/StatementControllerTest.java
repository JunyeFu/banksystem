package local.bank.channel.notifications;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAccountPort;
import local.bank.channel.identity.CustomerIdentityQuery;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class StatementControllerTest {
  @Test
  void usesCoreRunningBalanceAndSortsTransactionsDeterministically() {
    FineractAccountPort fineract = mock(FineractAccountPort.class);
    CustomerIdentityQuery identity = mock(CustomerIdentityQuery.class);
    Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").claim("sub", "customer-1").build();
    when(identity.linkedClient("customer-1")).thenReturn(11L);
    when(fineract.clientAccounts(11L)).thenReturn(List.of(new FineractAccountPort.SavingsAccount(
        21L, 11L, "000021", "CNY", new java.math.BigDecimal("80.00"), null, null, null, null)));
    when(fineract.accountDetails(21L)).thenReturn(new FineractAccountPort.SavingsAccount(
        21L, 11L, "000021", "CNY", new java.math.BigDecimal("80.00"), null, null, null, null));
    when(fineract.savingsTransactions(21L, null, null, "CNY")).thenReturn(List.of(
        new FineractAccountPort.SavingsTransaction("2", "2026-02-02", "DEBIT", "Withdrawal",
            new java.math.BigDecimal("20.00"), "CNY", new java.math.BigDecimal("80.00"), null, false),
        new FineractAccountPort.SavingsTransaction("1", "2026-02-01", "CREDIT", "Deposit",
            new java.math.BigDecimal("100.00"), "CNY", new java.math.BigDecimal("100.00"), null, false)));

    String csv = new String(new StatementController(fineract, identity)
        .statement(jwt, "21", null, null, "csv").getBody(), StandardCharsets.UTF_8);

    assertTrue(csv.startsWith("# openingBalance=0.00,credits=100.00,debits=20.00,closingBalance=80.00,balanceCheck=true"));
    assertTrue(csv.indexOf("2026-02-01T00:00:00Z,CREDIT") < csv.indexOf("2026-02-02T00:00:00Z,DEBIT"));
  }
}
