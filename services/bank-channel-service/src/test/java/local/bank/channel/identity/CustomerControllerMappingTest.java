package local.bank.channel.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CustomerControllerMappingTest {
  @Test
  void mapsCoreSavingsAccountToStableCustomerContract() {
    Map<String, Object> mapped = CustomerController.summary(Map.of(
        "id", 42,
        "accountNo", "621800005302",
        "currency", Map.of("code", "CNY"),
        "summary", Map.of("accountBalance", "128560.341"),
        "productName", "活期账户",
        "status", Map.of("value", "ACTIVE"),
        "timeline", Map.of("activatedOnDate", List.of(2025, 1, 15))));

    assertEquals("42", mapped.get("accountId"));
    assertEquals("****5302", mapped.get("maskedAccountNumber"));
    assertEquals("128560.34", mapped.get("balance"));
    assertEquals("活期账户", mapped.get("accountType"));
    assertEquals("ACTIVE", mapped.get("status"));
    assertEquals("2025-01-15", mapped.get("openedOn"));
  }

  @Test
  void mapsCoreWithdrawalWithoutExposingRawPayload() {
    Map<String, Object> mapped = CustomerController.transaction(Map.of(
        "id", 7,
        "date", List.of(2026, 7, 15),
        "transactionType", Map.of("value", "Withdrawal", "withdrawal", true),
        "amount", "8800.00",
        "runningBalance", "128560.34",
        "currency", Map.of("code", "CNY"),
        "note", "合成测试交易"));

    assertEquals("DEBIT", mapped.get("transactionType"));
    assertEquals("2026-07-15T00:00:00Z", mapped.get("transactionDate"));
    assertEquals("8800.00", mapped.get("amount"));
    assertEquals("合成测试交易", mapped.get("counterparty"));
    assertEquals(8, mapped.size());
  }

  @Test
  void mapsCoreLoanToStableCustomerContract() {
    Map<String, Object> mapped = CustomerController.loanSummary(Map.of(
        "id", 81,
        "productName", "个人经营贷",
        "principal", "300000",
        "summary", Map.of("totalOutstanding", "212400.0"),
        "currency", Map.of("code", "CNY"),
        "status", Map.of("value", "Active")));

    assertEquals("81", mapped.get("loanId"));
    assertEquals("个人经营贷", mapped.get("loanProductName"));
    assertEquals("300000.00", mapped.get("principal"));
    assertEquals("212400.00", mapped.get("outstandingBalance"));
    assertEquals("CNY", mapped.get("currency"));
    assertEquals("Active", mapped.get("status"));
  }

  @Test
  void mapsCoreLoanDetailDatesAndRate() {
    Map<String, Object> mapped = CustomerController.loanDetail(Map.of(
        "id", 81,
        "productName", "个人经营贷",
        "principal", "300000.00",
        "loanBalanceOutstanding", "212400.00",
        "currency", Map.of("code", "CNY"),
        "status", Map.of("value", "Active"),
        "termFrequency", 36,
        "interestRatePerPeriod", "4.35",
        "timeline", Map.of(
            "actualDisbursementDate", List.of(2026, 1, 15),
            "expectedMaturityDate", List.of(2029, 1, 15)),
        "repaymentSchedule", Map.of("periods", List.of(
            Map.of("period", 0),
            Map.of("period", 1, "dueDate", List.of(2026, 2, 15), "principalDue", "2500", "interestDue", "1100", "totalDueForPeriod", "3600", "complete", true)))), Map.of());

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
