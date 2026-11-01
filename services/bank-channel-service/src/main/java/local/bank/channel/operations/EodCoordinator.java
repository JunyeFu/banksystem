package local.bank.channel.operations;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.payments.EodRepository;
import local.bank.channel.payments.TransferRepository;
import local.bank.channel.payments.EodRepository.RunRow;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.audit.AuditService;
import local.bank.channel.reconciliation.ReconciliationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EodCoordinator {
  public static final List<String> STEPS = List.of(
      "LOCK_DATE", "CORE_HEALTH_CHECK", "PENDING_CHECK",
      "CHANNEL_TO_CLEARING", "CHANNEL_TO_CORE", "CORE_TO_GENERAL_LEDGER",
      "FINERACT_COB_BATCH", "FIX_APPLY_ANNUAL_FEE", "FIX_POST_INTEREST_SAVINGS",
      "FIX_PAY_DUE_SAVINGS_CHARGES", "FIX_LOAN_ARREARS_AGEING",
      "FIX_PENALTY_OVERDUE_LOANS", "FIX_TRANSFERS_INTEREST_TO_SAVINGS",
      "FIX_ACCOUNTING_RUNNING_BALANCES", "POST_JOB_CORE_TO_GENERAL_LEDGER",
      "AUDIT_CHECKPOINT", "ADVANCE_DATE", "UNLOCK_NEXT_BUSINESS_DAY");

  private final EodRepository repository;
  private final TransferRepository transfers;
  private final local.bank.channel.customerprofile.LoanOperationRepository loanOperations;
  private final FineractOperationsPort fineract;
  private final ReconciliationService reconciliation;
  private final AuditService audit;
  private final TransactionTemplate transactions;

  public EodCoordinator(EodRepository repository, TransferRepository transfers, FineractOperationsPort fineract,
                    ReconciliationService reconciliation, AuditService audit,
                    PlatformTransactionManager transactionManager, local.bank.channel.customerprofile.LoanOperationRepository loanOperations) {
    this.repository = repository;
    this.transfers = transfers;
    this.loanOperations=loanOperations;
    this.fineract = fineract;
    this.reconciliation = reconciliation;
    this.audit = audit;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  public Map<String, Object> run(LocalDate requestedDate, String idempotencyKey) {
    LocalDate date = requestedDate == null ? fineract.businessDate() : requestedDate;
    String key = idempotencyKey == null || idempotencyKey.isBlank()
        ? "internal-eod-" + date : idempotencyKey;
    EodRepository.LockHandle lock=repository.lock(date);
    if(lock==null)return current(date);
    try(lock) {
        EodRun run = register(date, key);
        if ("COMPLETED".equals(run.status()) || "FAILED".equals(run.status())) return view(run.id());
        LinkedHashSet<String> completed = new LinkedHashSet<>(completedSteps(run.id()));
        try {
          var unresolved=repository.unresolvedSteps(run.id());
          for(var pending:unresolved) {
            if(pending.version()==null || !fineract.jobCompletedAfter(jobId(pending.name()),pending.version()))
              throw new IllegalStateException("CORE_JOB_OUTCOME_UNKNOWN: "+pending.name());
            completeStep(run.id(),pending.name());
            completed.add(pending.name());
          }
          EodStepRunner.run(STEPS, completed, step -> executeStep(run.id(), run.date(), step),
              step -> completeStep(run.id(), step));
          finish(run.id(), "COMPLETED", "MATCHED", "EOD completed successfully");
        } catch (EodFailure failure) {
          finish(run.id(), "FAILED", failure.reconciliationStatus, failure.getMessage());
          audit.record("EOD_RECONCILIATION_FAILED", "SYSTEM", "eod-service", "EodRun",
              run.id().toString(), "EOD", "FAILED", null,
              Map.of("step", failure.step, "stepsCompleted", new ArrayList<>(completed)));
        } catch (RuntimeException interruption) {
          finish(run.id(), "INTERRUPTED", "BLOCKED", concise(interruption.getMessage()));
          audit.record("EOD_INTERRUPTED", "SYSTEM", "eod-service", "EodRun",
              run.id().toString(), "EOD", "FAILED", null,
              Map.of("stepsCompleted", new ArrayList<>(completed)));
        }
        return view(run.id());
    }
  }

  private EodRun register(LocalDate date, String key) {
    return transactions.execute(status -> {
      var keyed=repository.byKey(key);
      if (!keyed.isEmpty()) {
        RunRow run=keyed.get(0);
        if(!date.equals(run.date()))
          throw new ResponseStatusException(HttpStatus.CONFLICT,"EOD idempotency key is bound to another business date");
        if (!"COMPLETED".equals(run.status()) && !"FAILED".equals(run.status()))
          repository.resume(run.id());
        return new EodRun(run.id(), run.date(),
            "COMPLETED".equals(run.status()) || "FAILED".equals(run.status()) ? run.status() : "RUNNING");
      }
      var active=repository.active(date);
      if (!active.isEmpty()) {
        RunRow run=active.get(0);
        if (!"COMPLETED".equals(run.status()))
          repository.resume(run.id());
        return new EodRun(run.id(), run.date(), "COMPLETED".equals(run.status()) ? "COMPLETED" : "RUNNING");
      }
      UUID id = UUID.randomUUID();
      repository.create(id,date,key);
      return new EodRun(id, date, "RUNNING");
    });
  }

  private void executeStep(UUID runId, LocalDate date, String step) {
    Long beforeVersion=null;
    if(step.equals("FINERACT_COB_BATCH")||step.startsWith("FIX_")) {
      beforeVersion=fineract.jobVersionBeforeSubmission(jobId(step));
      long capturedVersion=beforeVersion;
      transactions.executeWithoutResult(tx->repository.startCoreStep(runId,step,capturedVersion));
    }
    switch (step) {
      case "LOCK_DATE", "UNLOCK_NEXT_BUSINESS_DAY" -> { }
      case "CORE_HEALTH_CHECK" -> {
        if (!fineract.checkHealth()) throw new EodFailure(step, "BLOCKED", "Core health unavailable");
      }
      case "PENDING_CHECK" -> {
        int pending=transfers.pendingForEod()+loanOperations.pendingForEod();
        if (pending > 0)
          throw new EodFailure(step, "DIFFERENCE", "Pending money operation exists: " + pending);
      }
      case "CHANNEL_TO_CLEARING", "CHANNEL_TO_CORE", "CORE_TO_GENERAL_LEDGER" ->
          requireMatched(step, reconciliation.runForEod(step, runId, date));
      case "POST_JOB_CORE_TO_GENERAL_LEDGER" ->
          requireMatched(step, reconciliation.runForEod("CORE_TO_GENERAL_LEDGER", runId, date, "POST"));
      case "FINERACT_COB_BATCH" -> fineract.runCobBatch();
      case "FIX_APPLY_ANNUAL_FEE" -> fineract.applyAnnualFeeForSavings();
      case "FIX_POST_INTEREST_SAVINGS" -> fineract.postInterestOnSavings();
      case "FIX_PAY_DUE_SAVINGS_CHARGES" -> fineract.payDueSavingsCharges();
      case "FIX_LOAN_ARREARS_AGEING" -> fineract.updateLoanArrearsAgeing();
      case "FIX_PENALTY_OVERDUE_LOANS" -> fineract.applyPenaltyToOverdueLoans();
      case "FIX_TRANSFERS_INTEREST_TO_SAVINGS" -> fineract.transferInterestToSavings();
      case "FIX_ACCOUNTING_RUNNING_BALANCES" -> fineract.updateAccountingRunningBalances();
      case "AUDIT_CHECKPOINT" -> audit.record("EOD_CHECKPOINT", "SYSTEM", "eod-service", "EodRun",
          runId.toString(), "CHECKPOINT", "SUCCESS", null, Map.of("businessDate", date.toString()));
      case "ADVANCE_DATE" -> advanceDate(date);
      default -> throw new IllegalStateException("Unknown EOD step " + step);
    }
    if(beforeVersion!=null&&!fineract.jobCompletedAfter(jobId(step),beforeVersion))
      throw new IllegalStateException("CORE_JOB_OUTCOME_UNKNOWN: "+step);
  }

  private static int jobId(String step) {
    return switch(step) {
      case "FINERACT_COB_BATCH" -> 31;
      case "FIX_APPLY_ANNUAL_FEE" -> 4;
      case "FIX_POST_INTEREST_SAVINGS" -> 6;
      case "FIX_PAY_DUE_SAVINGS_CHARGES" -> 8;
      case "FIX_LOAN_ARREARS_AGEING" -> 2;
      case "FIX_PENALTY_OVERDUE_LOANS" -> 12;
      case "FIX_TRANSFERS_INTEREST_TO_SAVINGS" -> 14;
      case "FIX_ACCOUNTING_RUNNING_BALANCES" -> 9;
      default -> throw new IllegalArgumentException("Not a core job step: "+step);
    };
  }

  private void requireMatched(String step, Map<String, Object> result) {
    if (!"MATCHED".equals(String.valueOf(result.get("status"))))
      throw new EodFailure(step, "DIFFERENCE", step + " reconciliation found differences");
  }

  private void advanceDate(LocalDate date) {
    LocalDate current = fineract.businessDate();
    if (current.equals(date.plusDays(1))) return;
    if (!current.equals(date))
      throw new EodFailure("ADVANCE_DATE", "BLOCKED", "Unexpected Fineract business date: " + current);
    fineract.advanceBusinessDate(date.plusDays(1));
  }

  private void completeStep(UUID runId, String step) {
    transactions.executeWithoutResult(status -> {
      repository.completeStep(runId,step);
    });
  }

  private List<String> completedSteps(UUID runId) {
    return repository.completedSteps(runId);
  }

  private void finish(UUID runId, String status, String reconciliationStatus, String reason) {
    transactions.executeWithoutResult(tx -> repository.finish(runId,status,reconciliationStatus,reason));
  }

  public Map<String, Object> latest() {
    var rows=repository.latest();
    return rows.isEmpty() ? Map.of("status", "NOT_STARTED") : view(rows.get(0));
  }

  private Map<String, Object> current(LocalDate date) {
    var rows=repository.current(date);
    return rows.isEmpty() ? Map.of("status", "RUNNING", "businessDate", date.toString()) : view(rows.get(0));
  }

  private Map<String, Object> view(UUID runId) {
    Map<String,Object> item=repository.view(runId);
    item.put("stepsCompleted",completedSteps(runId));
    return item;
  }

  private static String concise(String message) {
    if (message == null || message.isBlank()) return "EOD step interrupted";
    return message.length() <= 240 ? message : message.substring(0, 240);
  }

  private record EodRun(UUID id, LocalDate date, String status) {}

  private static final class EodFailure extends RuntimeException {
    final String step;
    final String reconciliationStatus;
    EodFailure(String step, String reconciliationStatus, String message) {
      super(message);
      this.step = step;
      this.reconciliationStatus = reconciliationStatus;
    }
  }
}
