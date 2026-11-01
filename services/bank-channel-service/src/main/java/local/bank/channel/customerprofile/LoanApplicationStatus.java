package local.bank.channel.customerprofile;

public enum LoanApplicationStatus {
  DRAFT,
  SUBMITTED,
  SCORED,
  APPROVED,
  CORE_SUBMITTED;

  public LoanApplicationStatus next() {
    return switch (this) {
      case DRAFT -> SUBMITTED;
      case SUBMITTED -> SCORED;
      case SCORED -> APPROVED;
      case APPROVED -> CORE_SUBMITTED;
      case CORE_SUBMITTED -> throw new IllegalStateException("Core submission is terminal for the application workflow");
    };
  }
}
