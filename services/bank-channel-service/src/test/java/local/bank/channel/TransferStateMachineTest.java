package local.bank.channel;

import org.junit.jupiter.api.Test;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import static org.junit.jupiter.api.Assertions.*;

class TransferStateMachineTest {

  @Test
  void createdCanTransitionToValidating() {
    assertTrue(isAllowed("CREATED", "VALIDATING"));
  }

  @Test
  void validatingCanTransitionToPendingApproval() {
    assertTrue(isAllowed("VALIDATING", "PENDING_APPROVAL"));
  }

  @Test
  void validatingCanTransitionToRiskReviewOrFailed() {
    assertTrue(isAllowed("VALIDATING", "RISK_REVIEW"));
    assertTrue(isAllowed("VALIDATING", "FAILED"));
  }

  @Test
  void pendingClearingCanTransitionToSettled() {
    assertTrue(isAllowed("PENDING_CLEARING", "SETTLED"));
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
  void settledCannotTransitionToReturned() {
    assertFalse(isAllowed("SETTLED", "RETURNED"));
  }

  @Test
  void reversalPendingCanTransitionToReversed() {
    assertTrue(isAllowed("REVERSAL_PENDING", "REVERSED"));
    assertTrue(isAllowed("REVERSAL_PENDING", "SETTLED"));
  }

  @Test
  void cannotSkipStates() {
    assertFalse(isAllowed("CREATED", "SETTLED"));
  }

  @Test
  void cannotReverseFromCreated() {
    assertFalse(isAllowed("CREATED", "REVERSED"));
  }

  @Test
  void timedOutIsTerminal() {
    assertTrue(isAllowed("TIMED_OUT", "SETTLED") == false);
  }

  @Test
  void returnedIsTerminal() {
    assertTrue(isAllowed("RETURNED", "REVERSAL_PENDING") == false);
  }

  private boolean isAllowed(String from, String to) {
    return new TransferStateMachine(null).allowedNext(Status.of(from)).contains(Status.of(to));
  }
}
