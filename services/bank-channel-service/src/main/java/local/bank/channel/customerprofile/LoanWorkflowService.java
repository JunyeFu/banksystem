package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import local.bank.channel.FineractLoanPort;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.CoreWriteRepository;
import local.bank.channel.customerprofile.LoanRepository.Application;
import local.bank.channel.customerprofile.LoanRepository.Approval;
import local.bank.channel.identity.CustomerIdentityRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LoanWorkflowService {
  private final LoanRepository repository;
  private final CustomerIdentityRepository identities;
  private final FineractLoanPort fineract;
  private final FineractOperationsPort operations;
  private final TransactionTemplate transactions;
  private final CoreWriteRepository coreWrites;
  private final long productId;
  private final String currency;
  private final BigDecimal quotedAnnualRate;
  private static final Set<String> REPAYMENT_METHODS = Set.of("EQUAL_INSTALLMENTS", "EQUAL_PRINCIPAL");

  public LoanWorkflowService(
      LoanRepository repository,
      CustomerIdentityRepository identities,
      FineractLoanPort fineract,
      FineractOperationsPort operations,
      PlatformTransactionManager transactionManager,
      @Value("${fineract.loan-product-id:1}") long productId,
      @Value("${fineract.loan-currency:CNY}") String currency,
      @Value("${bank.loan.quoted-annual-interest-rate:4.35}") BigDecimal quotedAnnualRate,
      CoreWriteRepository coreWrites) {
    this.repository = repository;
    this.identities = identities;
    this.fineract = fineract;
    this.operations = operations;
    this.transactions = new TransactionTemplate(transactionManager);
    this.productId = productId;
    this.currency = currency;
    this.quotedAnnualRate = quotedAnnualRate;
    this.coreWrites = coreWrites;
  }

  public Map<String, Object> createDraft(String subject, DraftRequest request) {
    if (request.amount() == null || request.amount().signum() <= 0
        || request.termMonths() < 1 || request.termMonths() > 480
        || request.purpose() == null || request.purpose().isBlank()
        || request.repaymentMethod() == null || !REPAYMENT_METHODS.contains(request.repaymentMethod())
        || (request.note() != null && request.note().length() > 240)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid loan application");
    }
    UUID id = UUID.randomUUID();
    repository.createDraft(id, subject, request.amount(), request.termMonths(), request.purpose().trim(),
        request.repaymentMethod().trim(), blankToNull(request.note()), quotedAnnualRate);
    return customerView(application(id, subject));
  }

  public Map<String, Object> submit(String subject, UUID id, long version) {
    requireTransition(LoanApplicationStatus.DRAFT, LoanApplicationStatus.SUBMITTED);
    int changed = repository.submit(subject, id, version);
    if (changed != 1) throw conflict("Application is not the requested editable draft version");
    return customerView(application(id, subject));
  }

  public Map<String, Object> score(UUID id, long version) {
    requireTransition(LoanApplicationStatus.SUBMITTED, LoanApplicationStatus.SCORED);
    Application row = application(id, null);
    if (!LoanApplicationStatus.SUBMITTED.name().equals(row.status()) || row.version() != version)
      throw conflict("Application version or state changed");
    int score = Math.max(0, Math.min(100,
        100 - row.requestedAmount().divide(new BigDecimal("1000"), 0, RoundingMode.DOWN).intValue() - row.termMonths()));
    String reason = score >= 60 ? "Deterministic score allows approval review" : "Deterministic score requires manual approval review";
    int changed = repository.score(id, version, score, reason);
    if (changed != 1) throw conflict("Application version or state changed");
    return operationsView(application(id, null));
  }

  public Map<String, Object> requestApproval(UUID id, String maker, long version, String reason) {
    if (reason == null || reason.isBlank()) throw badRequest("Reason is required");
    UUID approvalId = UUID.randomUUID();
    try {
      int inserted = repository.requestApproval(approvalId, id, maker, version, reason.trim());
      if (inserted != 1) throw conflict("Only the requested scored application version can enter approval");
    } catch (DuplicateKeyException duplicate) {
      throw conflict("Application already has a pending approval");
    }
    return Map.of("approvalId", approvalId.toString(), "applicationId", id.toString(),
        "status", "PENDING", "version", 1, "applicationVersion", version);
  }

  public Map<String, Object> approve(UUID approvalId, String checker, long version, ApprovalDecision decision) {
    if (decision.reason() == null || decision.reason().isBlank()
        || decision.approvedAmount() == null || decision.approvedAmount().signum() <= 0
        || decision.annualInterestRate() == null || decision.annualInterestRate().signum() <= 0) {
      throw badRequest("Approval amount, annual interest rate and reason are required");
    }
    return transactions.execute(status -> {
      Approval approval = repository.lockApproval(approvalId);
      if (approval.maker().equals(checker)) throw conflict("Maker cannot check own loan");
      Application application = application(approval.applicationId(), null);
      if (decision.approvedAmount().compareTo(application.requestedAmount()) > 0)
        throw badRequest("Approved amount cannot exceed requested amount");
      int approvalChanged = repository.approve(approvalId, checker, version, decision.reason().trim());
      if (approvalChanged != 1) throw conflict("Approval version or state changed");
      requireTransition(LoanApplicationStatus.SCORED, LoanApplicationStatus.APPROVED);
      int applicationChanged = repository.approveApplication(approval.applicationId(), approval.applicationVersion(),
          decision.approvedAmount(), decision.annualInterestRate());
      if (applicationChanged != 1) throw conflict("Application version or state changed");
      Map<String, Object> result = new LinkedHashMap<>(operationsView(application(approval.applicationId(), null)));
      result.put("approvalId", approvalId.toString());
      result.put("approvalStatus", "APPROVED");
      result.put("approvalVersion", version + 1);
      return result;
    });
  }

  public Map<String, Object> submitToCore(UUID id, String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.isBlank()) throw badRequest("Idempotency-Key is required");
    try (var lease = coreWrites.acquire()) {
      return submitUnderCoreLease(id, idempotencyKey);
    }
  }

  private Map<String, Object> submitUnderCoreLease(UUID id, String idempotencyKey) {
    Application row = application(id, null);
    if (row.coreLoanId() != null) {
      if(!idempotencyKey.equals(row.coreIdempotencyKey()))throw conflict("Application is bound to another core idempotency key");
      return coreReference(row);
    }
    if (!LoanApplicationStatus.APPROVED.name().equals(row.status()))
      throw conflict("Only an approved application can be submitted to core");
    boolean claimed=false;
    if (row.coreIdempotencyKey() == null) {
      claimed=repository.claimCoreKey(id, idempotencyKey);
      row = application(id, null);
    }
    if (!idempotencyKey.equals(row.coreIdempotencyKey()))
      throw conflict("Application is bound to another core idempotency key");
    long clientId = linkedClient(row.subject());
    BigDecimal approvedRate = row.approvedAnnualInterestRate();
    String scopedKey=id+":"+idempotencyKey;
    var command=new FineractLoanPort.LoanSubmissionCommand(clientId, productId, row.approvedAmount(),
            row.termMonths(), approvedRate, operations.postingDate(), row.repaymentMethod());
    FineractLoanPort.LoanSubmission core = claimed ? fineract.submitLoan(command, scopedKey)
        : fineract.findSubmittedLoan(clientId,scopedKey,command)
            .orElseThrow(()->conflict("Core loan submission outcome is unknown; only readback is permitted"));
    long coreId = core.loanId();
    requireTransition(LoanApplicationStatus.APPROVED, LoanApplicationStatus.CORE_SUBMITTED);
    int changed = repository.recordCoreLoan(id, idempotencyKey, coreId);
    if (changed != 1) {
      Application converged = application(id, null);
      if (converged.coreLoanId() == null || converged.coreLoanId().longValue() != coreId)
        throw conflict("Application core result could not converge");
      return coreReference(converged);
    }
    return coreReference(application(id, null));
  }

  public Map<String, Object> addDocument(String subject, UUID applicationId, String documentType) {
    if (documentType == null || documentType.isBlank()) throw badRequest("Document type is required");
    Application application = application(applicationId, subject);
    if (!LoanApplicationStatus.DRAFT.name().equals(application.status()))
      throw conflict("Documents can only be added to a draft application");
    UUID documentId = UUID.randomUUID();
    String controlledRef = "channel://loan-applications/" + applicationId + "/documents/" + documentId;
    repository.addDocument(documentId, applicationId, subject, documentType.trim(), controlledRef);
    return Map.of("documentId", documentId.toString(), "applicationId", applicationId.toString(),
        "documentType", documentType.trim(), "status", "RECEIVED");
  }

  public Map<String, Object> documents(String subject, UUID applicationId) {
    application(applicationId, subject);
    return Map.of("items", repository.documents(subject, applicationId));
  }

  public Map<String, Object> customerApplications(String subject) {
    return Map.of("items", repository.customerApplications(subject).stream()
        .map(this::customerView).toList());
  }

  public Map<String, Object> customerApplication(String subject, UUID id) {
    Map<String, Object> view = new LinkedHashMap<>(customerView(application(id, subject)));
    view.put("documents", documents(subject, id).get("items"));
    return view;
  }

  public Map<String, Object> operationsApplications() {
    return Map.of("items", repository.operationsApplications().stream().map(this::operationsView).toList());
  }

  public Map<String, Object> operationsApplication(UUID id) {
    Map<String, Object> view = new LinkedHashMap<>(operationsView(application(id, null)));
    view.put("documents", repository.documentsForOperations(id));
    view.put("approvals", repository.approvalsForOperations(id));
    return view;
  }

  private Application application(UUID id, String subject) {
    return repository.application(id, subject);
  }

  private long linkedClient(String subject) {
    List<Long> ids = identities.clientIds(subject);
    if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Customer identity is not linked");
    return ids.get(0);
  }

  private Map<String, Object> customerView(Application row) {
    Map<String, Object> result = baseView(row);
    return result;
  }

  private Map<String, Object> operationsView(Application row) {
    Map<String, Object> result = baseView(row);
    result.put("subject", row.subject());
    if (row.score() != null) result.put("score", row.score());
    if (row.scoringReason() != null) result.put("scoringReason", row.scoringReason());
    return result;
  }

  private Map<String, Object> baseView(Application row) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("applicationId", row.id().toString());
    result.put("amount", row.requestedAmount().toPlainString());
    result.put("currency", currency);
    result.put("termMonths", row.termMonths());
    result.put("purpose", row.purpose());
    result.put("repaymentMethod", row.repaymentMethod());
    if (row.customerNote() != null) result.put("note", row.customerNote());
    result.put("status", row.status());
    result.put("quotedAnnualInterestRate", row.quotedAnnualInterestRate().toPlainString());
    if (row.approvedAnnualInterestRate() != null)
      result.put("approvedAnnualInterestRate", row.approvedAnnualInterestRate().toPlainString());
    if (row.approvedAmount() != null) result.put("approvedAmount", row.approvedAmount().toPlainString());
    if (row.coreLoanId() != null) result.put("coreLoanId", row.coreLoanId());
    result.put("version", row.version());
    result.put("createdAt", row.createdAt());
    result.put("updatedAt", row.updatedAt());
    return result;
  }

  private Map<String, Object> coreReference(Application row) {
    return Map.of("applicationId", row.id().toString(), "coreLoanId", row.coreLoanId(),
        "status", row.status(), "version", row.version());
  }

  private static void requireTransition(LoanApplicationStatus from, LoanApplicationStatus to) {
    if (from.next() != to) throw new IllegalStateException("Invalid loan workflow transition");
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static ResponseStatusException conflict(String message) {
    return new ResponseStatusException(HttpStatus.CONFLICT, message);
  }

  private static ResponseStatusException badRequest(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  public record DraftRequest(BigDecimal amount, int termMonths, String purpose, String repaymentMethod, String note) {}
  public record ApprovalDecision(BigDecimal approvedAmount, BigDecimal annualInterestRate, String reason) {}
}
