package local.bank.channel;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TransferStateMachineTest {

  @Test
  void createdCanTransitionToValidating() {
    assertTrue(isAllowed("CREATED", "VALIDATING"));
  }

  @Test
  void validatingCanTransitionToPendingCorePosting() {
    assertTrue(isAllowed("VALIDATING", "PENDING_CORE_POSTING"));
  }

  @Test
  void validatingCanTransitionToFailed() {
    assertTrue(isAllowed("VALIDATING", "FAILED"));
  }

  @Test
  void pendingCorePostingCanTransitionToSettled() {
    assertTrue(isAllowed("PENDING_CORE_POSTING", "SETTLED"));
  }

  @Test
  void pendingCorePostingCanTransitionToFailed() {
    assertTrue(isAllowed("PENDING_CORE_POSTING", "FAILED"));
  }

  @Test
  void settledCanTransitionToReversalPending() {
    assertTrue(isAllowed("SETTLED", "REVERSAL_PENDING"));
  }

  @Test
  void settledCanTransitionToReturned() {
    assertTrue(isAllowed("SETTLED", "RETURNED"));
  }

  @Test
  void reversalPendingCanTransitionToReversed() {
    assertTrue(isAllowed("REVERSAL_PENDING", "REVERSED"));
  }

  @Test
  void cannotSkipStates() {
    assertFalse(isAllowed("CREATED", "SETTLED"));
  }

  @Test
  void cannotReverseFromCreated() {
    assertFalse(isAllowed("CREATED", "REVERSED"));
  }

  private boolean isAllowed(String from, String to) {
    return java.util.Map.of(
        "CREATED", java.util.Set.of("VALIDATING"),
        "VALIDATING", java.util.Set.of("RISK_REVIEW", "PENDING_CORE_POSTING", "FAILED"),
        "RISK_REVIEW", java.util.Set.of("PENDING_APPROVAL", "PENDING_CORE_POSTING", "FAILED"),
        "PENDING_APPROVAL", java.util.Set.of("PENDING_CORE_POSTING", "FAILED"),
        "PENDING_CORE_POSTING", java.util.Set.of("PENDING_CLEARING", "SETTLED", "FAILED"),
        "PENDING_CLEARING", java.util.Set.of("SETTLED", "TIMED_OUT", "FAILED"),
        "SETTLED", java.util.Set.of("RETURNED", "REVERSAL_PENDING"),
        "REVERSAL_PENDING", java.util.Set.of("REVERSED")
    ).getOrDefault(from, java.util.Set.of()).contains(to);
  }
}
