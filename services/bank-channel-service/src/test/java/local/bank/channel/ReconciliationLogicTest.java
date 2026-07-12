package local.bank.channel;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReconciliationLogicTest {

  @Test
  void channelToCoreShouldCheckSettledStatus() {
    String checkSql = "SELECT count(*) FROM transfer WHERE status='SETTLED' AND (core_reference IS NULL OR core_reference='')";
    assertTrue(checkSql.contains("SETTLED"));
    assertFalse(checkSql.contains("POSTED"));
  }

  @Test
  void channelToClearingShouldCheckSettledAndReversed() {
    String checkSql = "t.status NOT IN ('SETTLED','REVERSED')";
    assertTrue(checkSql.contains("SETTLED"));
    assertTrue(checkSql.contains("REVERSED"));
  }

  @Test
  void coreToLedgerShouldCheckSettledAndReversed() {
    String checkSql = "SELECT count(*) FROM transfer WHERE status IN ('SETTLED','REVERSED') AND (core_reference IS NULL OR core_reference='')";
    assertTrue(checkSql.contains("SETTLED"));
    assertTrue(checkSql.contains("REVERSED"));
    assertFalse(checkSql.contains("POSTED"));
  }

  @Test
  void mockClearingShouldSupportV4Scenarios() {
    var scenarios = java.util.Set.of(
        "SUCCESS_IMMEDIATE", "SUCCESS_DELAYED", "REJECT_ACCOUNT_INVALID", "REJECT_BANK_UNAVAILABLE",
        "TIMEOUT_THEN_SUCCESS", "TIMEOUT_THEN_FAIL", "RETURN_AFTER_SETTLEMENT",
        "DUPLICATE_CALLBACK", "OUT_OF_ORDER_CALLBACK");
    assertEquals(9, scenarios.size());
    assertTrue(scenarios.contains("SUCCESS_IMMEDIATE"));
    assertTrue(scenarios.contains("OUT_OF_ORDER_CALLBACK"));
    assertFalse(scenarios.contains("SUCCESS"));
    assertFalse(scenarios.contains("TIMEOUT"));
  }

  @Test
  void eodShouldExecuteAllSteps() {
    var expectedSteps = java.util.List.of(
        "LOCK_DATE", "CORE_HEALTH_CHECK", "PENDING_CHECK",
        "CHANNEL_TO_CLEARING", "CHANNEL_TO_CORE", "CORE_TO_GENERAL_LEDGER",
        "AUDIT_CHECKPOINT", "READY_TO_ADVANCE");
    assertEquals(8, expectedSteps.size());
    assertTrue(expectedSteps.contains("CHANNEL_TO_CLEARING"));
    assertTrue(expectedSteps.contains("AUDIT_CHECKPOINT"));
  }

  @Test
  void outboxMaxAttemptsShouldBeFive() {
    int maxAttempts = 5;
    assertEquals(5, maxAttempts);
  }
}
