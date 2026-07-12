package local.bank.channel;

import org.junit.jupiter.api.Test;
import local.bank.channel.statemachine.TransferStateMachine;
import local.bank.channel.statemachine.TransferStateMachine.Status;
import static org.junit.jupiter.api.Assertions.*;

class TransferStateMachineTest {

  @Test
  void createdCanTransitionToRiskPending() {
    assertTrue(isAllowed("CREATED", "RISK_PENDING"));
  }

  @Test
  void riskPendingCanTransitionToApproved() {
    assertTrue(isAllowed("RISK_PENDING", "APPROVED"));
  }

  @Test
  void riskPendingCanTransitionToReviewRequiredOrFailed() {
    assertTrue(isAllowed("RISK_PENDING", "REVIEW_REQUIRED"));
    assertTrue(isAllowed("RISK_PENDING", "FAILED"));
  }

  @Test
  void submittedCanTransitionToSettled() {
    assertTrue(isAllowed("SUBMITTED", "SETTLED"));
  }

  @Test
  void reservedCanTransitionToFailed() {
    assertTrue(isAllowed("RESERVED", "FAILED"));
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
    return new TransferStateMachine(null).allowedNext(Status.of(from)).contains(Status.of(to));
  }
}
