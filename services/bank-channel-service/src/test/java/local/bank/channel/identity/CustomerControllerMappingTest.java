package local.bank.channel.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import local.bank.channel.CoreReadModelException;
import local.bank.channel.FineractAccountPort;
import local.bank.channel.FineractLoanPort;
import org.junit.jupiter.api.Test;

class CustomerControllerMappingTest {
  @Test
  void mapsCoreSavingsAccountToStableCustomerContract() {
    Map<String, Object> mapped = CustomerController.summary(new FineractAccountPort.SavingsAccount(
        42, 11L, "621800005302", "CNY", new java.math.BigDecimal("128560.34"),
        "活期账户", "ACTIVE", "active", java.time.LocalDate.of(2025, 1, 15)));

    assertEquals("42", mapped.get("accountId"));
    assertEquals("****5302", mapped.get("maskedAccountNumber"));
    assertEquals("128560.34", mapped.get("balance"));
    assertEquals("活期账户", mapped.get("accountType"));
    assertEquals("ACTIVE", mapped.get("status"));
    assertEquals("2025-01-15", mapped.get("openedOn"));
  }

  @Test
  void mapsCoreWithdrawalWithoutExposingRawPayload() {
    Map<String, Object> mapped = CustomerController.transaction(new FineractAccountPort.SavingsTransaction(
        "7", "2026-07-15", "DEBIT", "Withdrawal", new java.math.BigDecimal("8800.00"),
        "CNY", new java.math.BigDecimal("128560.34"), "合成测试交易", false));

    assertEquals("DEBIT", mapped.get("transactionType"));
    assertEquals("2026-07-15T00:00:00Z", mapped.get("transactionDate"));
    assertEquals("8800.00", mapped.get("amount"));
    assertEquals("合成测试交易", mapped.get("counterparty"));
    assertEquals(8, mapped.size());
  }

  @Test
  void preservesSignedCoreMoneyInsteadOfTakingAbsoluteValue() {
    Map<String, Object> mapped = CustomerController.transaction(new FineractAccountPort.SavingsTransaction(
        "8", "2026-07-16", "DEBIT", "Withdrawal", new java.math.BigDecimal("-12.50"),
        "CNY", null, null, false));
    assertEquals("-12.50", mapped.get("amount"));
  }

  @Test
  void rejectsMissingDateUnknownTypeAndInvalidMoney() {
    Map<String, Object> base = Map.of(
        "id", 9, "transactionType", Map.of("value", "Mystery"),
        "amount", "10.00", "currency", Map.of("code", "CNY"));
    assertThrows(CoreReadModelException.class, () -> CustomerController.transaction(
        new FineractAccountPort.SavingsTransaction("9", "2026-07-17", "CREDIT", "Deposit", null,
            "CNY", null, null, false)));
  }

  @Test
  void mapsCoreLoanToStableCustomerContract() {
    Map<String, Object> mapped = CustomerController.loanSummary(new FineractLoanPort.LoanAccount(
        81, "个人经营贷", new java.math.BigDecimal("300000.00"),
        new java.math.BigDecimal("212400.00"), "CNY", "Active", 0, null,
        null, null, List.of(), null));

    assertEquals("81", mapped.get("loanId"));
    assertEquals("个人经营贷", mapped.get("loanProductName"));
    assertEquals("300000.00", mapped.get("principal"));
    assertEquals("212400.00", mapped.get("outstandingBalance"));
    assertEquals("CNY", mapped.get("currency"));
    assertEquals("Active", mapped.get("status"));
  }

  @Test
  void mapsCoreLoanDetailDatesAndRate() {
    var detail = new FineractLoanPort.LoanAccount(
        81, "个人经营贷", new java.math.BigDecimal("300000.00"),
        new java.math.BigDecimal("212400.00"), "CNY", "Active", 36, "4.35",
        java.time.LocalDate.of(2026, 1, 15), java.time.LocalDate.of(2029, 1, 15),
        List.of(new FineractLoanPort.Installment(1, java.time.LocalDate.of(2026, 2, 15),
            new java.math.BigDecimal("2500.00"), new java.math.BigDecimal("1100.00"),
            new java.math.BigDecimal("3600.00"), true)), null);
    Map<String, Object> mapped = CustomerController.loanDetail(detail, detail);

    assertEquals(36, mapped.get("termMonths"));
    assertEquals("4.35", mapped.get("interestRate"));
    assertEquals("2026-01-15", mapped.get("startDate"));
    assertEquals("2029-01-15", mapped.get("endDate"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> schedule = (List<Map<String, Object>>) mapped.get("repaymentSchedule");
    assertEquals(1, schedule.size());
    assertEquals("2026-02-15", schedule.get(0).get("dueDate"));
    assertEquals("PAID", schedule.get(0).get("status"));
  }
}
