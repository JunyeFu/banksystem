package local.bank.channel;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import local.bank.channel.identity.CustomerIdentityRepository;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.notifications.NotificationRepository;
import local.bank.channel.audit.AuditRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientResponseException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import local.bank.channel.audit.AuditService;
import local.bank.channel.beneficiaries.BeneficiaryTokenService;
import org.springframework.transaction.annotation.Transactional;

@Profile("test-support")
@RestController
@RequestMapping("/internal/test-support/v1")
@PreAuthorize("hasAuthority('ROLE_TEST_SUPPORT')")
public class TestSupportController {
  public record IdentityLinkRequest(String subject, String logicalRef) { }
  public record TransferFixtureRequest(UUID fixtureId, UUID subject) { }
  /**
   * Local/test-only browser-suite fixture.  Core-money changes are always
   * performed through Fineract capability ports; this controller never writes a
   * Fineract database directly.
   */
  public record CustomerScenarioRequest(String subject, String logicalCustomerRef, String destinationCustomerRef) { }
  private final CustomerIdentityRepository identities;
  private final BeneficiaryRepository beneficiaries;
  private final NotificationRepository notifications;
  private final AuditRepository auditRepository;
  private final TestSupportProjectionRepository projections;
  private final FineractAccountPort fineract;
  private final FineractOperationsPort operations;
  private final AuditService audit;
  private final BeneficiaryTokenService beneficiaryTokens;
  private final FixtureCatalog catalog;
  private final FixtureLifecycleService fixtures;
  private final IsolatedTransferFixtureService transferFixtures;

  public TestSupportController(CustomerIdentityRepository identities, BeneficiaryRepository beneficiaries,
                               NotificationRepository notifications, AuditRepository auditRepository,
                               TestSupportProjectionRepository projections,
                               FineractAccountPort fineract, FineractOperationsPort operations, AuditService audit,
                               BeneficiaryTokenService beneficiaryTokens, FixtureCatalog catalog,
                               FixtureLifecycleService fixtures, IsolatedTransferFixtureService transferFixtures) {
    this.identities=identities;
    this.beneficiaries=beneficiaries;
    this.notifications=notifications;
    this.auditRepository=auditRepository;
    this.projections=projections;
    this.fineract = fineract;
    this.operations = operations;
    this.audit = audit;
    this.beneficiaryTokens = beneficiaryTokens;
    this.catalog = catalog;
    this.fixtures = fixtures;
    this.transferFixtures = transferFixtures;
  }

  @PostMapping("/transfer-fixtures:prepare")
  public IsolatedTransferFixtureService.Result prepareTransferFixture(@RequestBody TransferFixtureRequest request) {
    return transferFixtures.prepare(request.fixtureId(),request.subject());
  }

  @GetMapping("/transfer-fixtures/{fixtureId}")
  public IsolatedTransferFixtureService.Result validateTransferFixture(@PathVariable UUID fixtureId,
      @RequestParam UUID subject,@RequestParam UUID beneficiaryRef) {
    return transferFixtures.validate(fixtureId,subject,beneficiaryRef);
  }

  @PostMapping("/fixtures:seed")
  public ResponseEntity<Map<String, Object>> seed() {
    try {
      Map<String, Object> result = fixtures.seed();
      audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "Fixture", "all", "SEED", "SUCCESS", null, null);
      return ResponseEntity.ok(result);
    } catch (Exception error) {
      audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "Fixture", "all", "SEED", "FAILED", null, Map.of("reason", error.getClass().getSimpleName()));
      Map<String,Object> failure=new LinkedHashMap<>(Map.of("status", "FAILED", "reason", "FIXTURE_SEED_FAILED", "failureClass", error.getClass().getSimpleName()));
      if(error instanceof RestClientResponseException coreError) {
        failure.put("coreStatus",coreError.getStatusCode().value());
        var coreBody=coreError.getResponseBodyAs(com.fasterxml.jackson.databind.JsonNode.class);
        var violations=new ArrayList<Map<String,String>>();
        if(coreBody!=null&&coreBody.path("errors").isArray())for(var issue:coreBody.path("errors")) {
          String field=issue.path("parameterName").asText("");
          String code=issue.path("userMessageGlobalisationCode").asText("");
          if(field.matches("[A-Za-z][A-Za-z0-9]{0,79}")&&code.matches("[A-Za-z0-9_.-]{1,160}"))
            violations.add(Map.of("field",field,"code",code));
        }
        failure.put("coreValidation",violations);
      }
      return ResponseEntity.internalServerError().body(failure);
    }
  }

  private Map<String, Map<String, Object>> loadBaselineFixtures() {
    return catalog.all();
  }

  private static String fixtureSubject(Map<String, Object> fixture) {
    return FixtureLifecycleService.fixtureSubject(fixture);
  }

  private static String requiredFixtureText(Map<String, Object> fixture, String field) {
    return FixtureLifecycleService.requiredText(fixture, field);
  }

  @PostMapping("/fixtures:reset")
  public ResponseEntity<Map<String, Object>> reset() {
    Map<String, Object> result = fixtures.reset();
    audit.record(AuditService.EVENT_FIXTURE_RESET, "SYSTEM", "test-support", "Fixture", "all", "RESET", "SUCCESS", null, null);
    return ResponseEntity.ok(result);
  }

  @PostMapping("/identities:link")
  @Transactional
  public ResponseEntity<Map<String, Object>> linkIdentity(@RequestBody IdentityLinkRequest request) {
    if (request == null || request.subject() == null || !request.subject().matches("^[A-Za-z0-9._:-]{8,128}$")) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_SUBJECT"));
    }
    if (!List.of("customer.alice", "customer.bob").contains(request.logicalRef())) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_LOGICAL_REF"));
    }
    Map<String, Map<String, Object>> fixtures = loadBaselineFixtures();
    Map<String, Object> fixture = fixtures == null ? null : fixtures.get(request.logicalRef());
    if (fixture == null) return ResponseEntity.notFound().build();
    String fixtureSubject = fixtureSubject(fixture);
    List<Long> clientIds=identities.clientIds(fixtureSubject);
    if (clientIds.isEmpty()) return ResponseEntity.notFound().build();
    identities.bind(request.subject(),clientIds.get(0));
    audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerIdentity",
        request.logicalRef(), "LINK", "SUCCESS", null, Map.of("logicalRef", request.logicalRef()));
    return ResponseEntity.ok(Map.of("status", "LINKED", "logicalRef", request.logicalRef()));
  }

  @DeleteMapping("/identities/{subject}")
  @Transactional
  public ResponseEntity<Map<String, Object>> unlinkIdentity(@PathVariable String subject) {
    if (subject == null || !subject.matches("^[A-Za-z0-9._:-]{8,128}$") || subject.startsWith("fixture-")) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_SUBJECT"));
    }
    int deleted=identities.deleteSubject(subject);
    audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerIdentity",
        subject, "UNLINK", "SUCCESS", null, Map.of("deleted", deleted));
    return ResponseEntity.ok(Map.of("status", "UNLINKED", "deleted", deleted));
  }

  @PostMapping("/customer-scenario:seed")
  @Transactional
  public ResponseEntity<Map<String, Object>> seedCustomerScenario(@RequestBody CustomerScenarioRequest request) {
    if (request == null || request.subject() == null || !request.subject().matches("^[A-Za-z0-9._:-]{8,128}$")) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_SUBJECT"));
    }
    if (!"customer.alice".equals(request.logicalCustomerRef()) || !"customer.bob".equals(request.destinationCustomerRef())) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_SCENARIO_REFERENCES"));
    }
    List<Long> sourceClients=identities.clientIds(request.subject());
    List<Long> destinationClients=identities.clientIds("fixture-bob");
    if (sourceClients.isEmpty() || destinationClients.isEmpty()) {
      return ResponseEntity.status(409).body(Map.of("status", "REJECTED", "reason", "FIXTURE_IDENTITY_NOT_READY"));
    }
    String stage = "LOAD_ACCOUNTS";
    try {
      FineractAccountPort.SavingsAccount source = fineract.savingsByExternalId((String) catalog.require("account.alice.primarySavings").get("externalId"));
      FineractAccountPort.SavingsAccount destination = fineract.savingsByExternalId((String) catalog.require("account.bob.primarySavings").get("externalId"));
      if (source == null || destination == null) throw new IllegalStateException("Fixture savings account missing");
      stage = "VALIDATE_DESTINATION";
      long sourceAccountId = source.id();
      long destinationAccountId = destination.id();
      stage = "ACTIVATE_SOURCE";
      ensureActiveSavings(sourceAccountId, source);
      stage = "ACTIVATE_DESTINATION";
      ensureActiveSavings(destinationAccountId, destination);
      String destinationNumber = destination.accountNumber();
      if (destinationNumber == null || destinationNumber.length() < 6) {
        return ResponseEntity.status(409).body(Map.of("status", "REJECTED", "reason", "DESTINATION_ACCOUNT_NOT_READY"));
      }
      stage = "CHECK_TRANSACTIONS";
      boolean hasTransactions = !fineract.savingsTransactions(sourceAccountId, null, null, source.currency()).isEmpty();
      if (!hasTransactions) {
        stage = "FUND_SOURCE";
        fineract.depositSavings(sourceAccountId, new BigDecimal("1000.00"));
        audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerScenario", request.subject(),
            "FUND", "SUCCESS", null, Map.of("amount", "1000.00", "currency", "CNY"));
      }
      String accountToken = beneficiaryTokens.token(destinationNumber);
      stage = "UPSERT_BENEFICIARY";
      UUID beneficiaryId = UUID.nameUUIDFromBytes(("i10-scenario-beneficiary|" + request.subject() + "|" + accountToken).getBytes(StandardCharsets.UTF_8));
      beneficiaryId=beneficiaries.saveScenario(request.subject(),String.valueOf(destinationAccountId),accountToken,
          destinationNumber.substring(destinationNumber.length()-4),"I10测试收款人",beneficiaryId);
      UUID notificationId = UUID.nameUUIDFromBytes(("i10-scenario-notification|" + request.subject()).getBytes(StandardCharsets.UTF_8));
      stage = "UPSERT_NOTIFICATION";
      notifications.seedScenario(notificationId,request.subject());
      audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerScenario", request.subject(),
          "SEED", "SUCCESS", null, Map.of("scenario", "I10_BROWSER_OCR", "sourceAccountId", sourceAccountId));
      return ResponseEntity.ok(Map.of("status", "READY", "scenario", "I10_BROWSER_OCR", "beneficiaryId", beneficiaryId.toString(),
          "sourceAccountId", sourceAccountId, "notificationCreated", true));
    } catch (Exception ex) {
      audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerScenario", request.subject(),
          "SEED", "FAILED", null, Map.of("reason", ex.getClass().getSimpleName()));
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", "I10_SCENARIO_SEED_FAILED",
          "failureClass", ex.getClass().getSimpleName(), "failureStage", stage, "failureHint", safeFineractHint(ex)));
    }
  }

  @PostMapping("/customer-scenario:clear")
  @Transactional
  public ResponseEntity<Map<String, Object>> clearCustomerScenario(@RequestBody CustomerScenarioRequest request) {
    if (request == null || request.subject() == null || !request.subject().matches("^[A-Za-z0-9._:-]{8,128}$")) {
      return ResponseEntity.badRequest().body(Map.of("status", "REJECTED", "reason", "INVALID_SUBJECT"));
    }
    int notifications=this.notifications.clearScenario(request.subject());
    int beneficiaries=this.beneficiaries.clearScenario(request.subject());
    int retained=this.beneficiaries.retainedScenario(request.subject());
    return ResponseEntity.ok(Map.of("status", "CLEARED", "notifications", notifications,
        "beneficiaries", beneficiaries, "retainedHistoricalBeneficiaries", retained));
  }

  private void ensureActiveSavings(long accountId, FineractAccountPort.SavingsAccount account) {
    String normalized = String.valueOf(account.statusCode()).toLowerCase(java.util.Locale.ROOT);
    if (normalized.contains("active")) return;
    if (normalized.contains("submitted")) {
      fineract.approveSavings(accountId);
      fineract.activateSavings(accountId);
      return;
    }
    if (normalized.contains("approved")) {
      fineract.activateSavings(accountId);
      return;
    }
    throw new IllegalStateException("Unsupported savings account status");
  }

  private static String safeFineractHint(Exception error) {
    if (!(error instanceof RestClientResponseException response)) return "UNCLASSIFIED";
    String body = response.getResponseBodyAsString();
    java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(
        "\"(?:parameterName|developerMessageCode|userMessageGlobalisationCode|errorCode)\"\\s*:\\s*\"([A-Za-z0-9._-]{1,96})\"")
        .matcher(body);
    String fallback = null;
    while (matcher.find()) {
      String value = matcher.group(1);
      if (!"validation.msg.validation.errors.exist".equals(value)) return value;
      fallback = value;
    }
    return fallback == null ? "HTTP_" + response.getStatusCode().value() : fallback;
  }

  @GetMapping("/fixtures/{logicalRef}")
  public ResponseEntity<Map<String, Object>> getFixture(@PathVariable String logicalRef) {
    if (logicalRef.startsWith("customer.")) {
      Map<String, Map<String, Object>> fixtures = loadBaselineFixtures();
      Map<String, Object> fixture = fixtures == null ? null : fixtures.get(logicalRef);
      if (fixture == null) return ResponseEntity.notFound().build();
      var rows=identities.clientIds(fixtureSubject(fixture));
      if (rows.isEmpty()) return ResponseEntity.notFound().build();
      return ResponseEntity.ok(Map.of("logicalRef",logicalRef,"subject",fixtureSubject(fixture),"fineractClientId",rows.get(0)));
    }
    if (logicalRef.startsWith("account.")) {
      Map<String, Map<String, Object>> fixtures = loadBaselineFixtures();
      Map<String, Object> accountFixture = fixtures == null ? null : fixtures.get(logicalRef);
      if (accountFixture == null) return ResponseEntity.notFound().build();
      String customerRef = logicalRef.startsWith("account.alice.") ? "customer.alice" : logicalRef.startsWith("account.bob.") ? "customer.bob" : null;
      Map<String, Object> customerFixture = customerRef == null || fixtures == null ? null : fixtures.get(customerRef);
      if (customerFixture == null) return ResponseEntity.notFound().build();
      var customerRows=identities.clientIds(fixtureSubject(customerFixture));
      if (customerRows.isEmpty()) return ResponseEntity.notFound().build();
      long clientId=customerRows.get(0);
      try {
        var account = fineract.savingsByExternalId(requiredFixtureText(accountFixture, "externalId"));
        if (account == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("logicalRef", logicalRef, "accountId", account.id(), "accountNumber", account.accountNumber(), "currency", account.currency(), "clientId", clientId));
      } catch (Exception e) {
        return ResponseEntity.ok(Map.of("logicalRef", logicalRef, "accountId", 0, "currency", "CNY", "error", e.getMessage()));
      }
    }
    return ResponseEntity.notFound().build();
  }

  @SuppressWarnings("unchecked")
  @GetMapping("/pages")
  public ResponseEntity<List<Map<String, Object>>> pages() {
    List<Map<String, Object>> fallback = List.of(
        Map.of("pageId", "customer.login", "routePattern", "/login"),
        Map.of("pageId", "customer.dashboard", "routePattern", "/dashboard"),
        Map.of("pageId", "customer.accounts", "routePattern", "/accounts"),
        Map.of("pageId", "customer.account.detail", "routePattern", "/accounts/:accountId"),
        Map.of("pageId", "customer.transfers", "routePattern", "/transfers"),
        Map.of("pageId", "customer.transfer.create", "routePattern", "/transfers/new"),
        Map.of("pageId", "customer.transfer.verification", "routePattern", "/verification"),
        Map.of("pageId", "customer.transfer.order.query", "routePattern", "/orders/query"),
        Map.of("pageId", "customer.transfer.result", "routePattern", "/transfers/:transferId"),
        Map.of("pageId", "customer.beneficiaries", "routePattern", "/beneficiaries"),
        Map.of("pageId", "customer.loans", "routePattern", "/loans"),
        Map.of("pageId", "customer.loans.apply", "routePattern", "/loans/apply"),
        Map.of("pageId", "customer.loan.detail", "routePattern", "/loans/:loanId"),
        Map.of("pageId", "customer.documents", "routePattern", "/documents"),
        Map.of("pageId", "customer.messages", "routePattern", "/messages"),
        Map.of("pageId", "customer.profile", "routePattern", "/profile"),
        Map.of("pageId", "customer.security", "routePattern", "/security"),
        Map.of("pageId", "operations.dashboard", "routePattern", "/dashboard"),
        Map.of("pageId", "operations.payments", "routePattern", "/payments"),
        Map.of("pageId", "operations.payments.detail", "routePattern", "/payments/:transferId"),
        Map.of("pageId", "operations.approvals", "routePattern", "/approvals"),
        Map.of("pageId", "operations.clearing", "routePattern", "/clearing"),
        Map.of("pageId", "operations.reconciliation", "routePattern", "/reconciliation"),
        Map.of("pageId", "operations.eod", "routePattern", "/eod"),
        Map.of("pageId", "operations.risk.alerts", "routePattern", "/risk/alerts"),
        Map.of("pageId", "operations.risk.cases", "routePattern", "/risk/cases"),
        Map.of("pageId", "operations.documents", "routePattern", "/documents"),
        Map.of("pageId", "operations.audit", "routePattern", "/audit"),
        Map.of("pageId", "operations.system-health", "routePattern", "/system-health"));
    try (InputStream in = new ClassPathResource("catalogs/page-catalog.seed.yaml").getInputStream()) {
      ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
      Map<String, Object> root = yamlMapper.readValue(in, Map.class);
      Object pagesList = root.get("pages");
      if (!(pagesList instanceof List<?> rawList)) return ResponseEntity.ok(fallback);
      List<Map<String, Object>> result = new ArrayList<>();
      for (Object item : rawList) {
        if (!(item instanceof Map<?, ?> p)) continue;
        String pageId = String.valueOf(p.get("pageId"));
        String routePattern = String.valueOf(p.get("routePattern"));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("pageId", pageId);
        row.put("routePattern", routePattern);
        Object ready = p.get("readyMarker");
        if (ready instanceof Map<?, ?> rm && rm.get("testId") != null)
          row.put("readyMarker", String.valueOf(rm.get("testId")));
        result.add(row);
      }
      return ResponseEntity.ok(result);
    } catch (Exception e) {
      return ResponseEntity.ok(fallback);
    }
  }

  @GetMapping("/assertions/payments/{paymentId}")
  public ResponseEntity<Map<String, Object>> assertPayment(@PathVariable UUID paymentId) {
    var transferRows=projections.transfers(paymentId);
    if (transferRows.isEmpty()) return ResponseEntity.notFound().build();

    var historyRows=projections.history(paymentId);

    var outboxRows=projections.outbox(paymentId);

    int auditCount=projections.auditCount(paymentId);

    boolean idempotencyExists=projections.idempotencyExists(paymentId);

    Map<String, Object> transfer = transferRows.get(0);
    String coreReference = (String) transfer.get("coreReference");
    boolean coreTransactionVerified = false;
    boolean coreAmountMatched = false;
    int coreEntryCount = 0;
    if (coreReference != null && !coreReference.isEmpty()) {
      try {
        var journal = operations.journalEntries();
        var matchingEntries = journal.stream().filter(e -> coreReference.equals(e.transactionId())).toList();
        coreTransactionVerified = !matchingEntries.isEmpty();
        coreEntryCount = matchingEntries.size();
        coreAmountMatched = matchingEntries.stream().anyMatch(e ->
            new BigDecimal(String.valueOf(transfer.get("amount"))).compareTo(e.amount()) == 0);
      } catch (Exception e) {
        coreTransactionVerified = false;
      }
    }

    return ResponseEntity.ok(Map.of(
        "transfer", transfer,
        "stateHistory", historyRows,
        "outbox", outboxRows,
        "auditCount", auditCount,
        "idempotencyRecordExists", idempotencyExists,
        "coreTransactionVerified", coreTransactionVerified,
        "coreTransactionFound", coreTransactionVerified,
        "coreAmountMatched", coreAmountMatched,
        "coreEntryCount", coreEntryCount));
  }

  @GetMapping("/assertions/accounting-projection/{correlationId}")
  public ResponseEntity<Map<String, Object>> assertAccountingProjection(@PathVariable String correlationId) {
    var localEntries=projections.accountingEntries(correlationId);
    java.math.BigDecimal localDebits = java.math.BigDecimal.ZERO;
    java.math.BigDecimal localCredits = java.math.BigDecimal.ZERO;
    for (Map<String, Object> e : localEntries) {
      localDebits = localDebits.add(new java.math.BigDecimal((String) e.get("debit")));
      localCredits = localCredits.add(new java.math.BigDecimal((String) e.get("credit")));
    }
    boolean localBalanced = localDebits.compareTo(localCredits) == 0;

    var coreEntries = operations.journalEntries();
    java.math.BigDecimal coreDebits = java.math.BigDecimal.ZERO;
    java.math.BigDecimal coreCredits = java.math.BigDecimal.ZERO;
    for (FineractOperationsPort.JournalEntry entry : coreEntries) {
      var amount = entry.amount();
      String entryType = entry.entryType();
      if ("DEBIT".equals(entryType)) coreDebits = coreDebits.add(amount);
      else if ("CREDIT".equals(entryType)) coreCredits = coreCredits.add(amount);
    }
    boolean coreBalanced = coreDebits.compareTo(coreCredits) == 0;

    return ResponseEntity.ok(Map.of(
        "projectionEntries", localEntries,
        "projectionEntryCount", localEntries.size(),
        "projectionDebits", localDebits.toPlainString(),
        "projectionCredits", localCredits.toPlainString(),
        "projectionBalanced", localBalanced,
        "coreEntries", coreEntries.size(),
        "coreDebits", coreDebits.toPlainString(),
        "coreCredits", coreCredits.toPlainString(),
        "coreBalanced", coreBalanced));
  }

  @GetMapping("/assertions/reconciliation/{correlationId}")
  public ResponseEntity<Map<String, Object>> assertReconciliation(@PathVariable String correlationId) {
    var reconRows=projections.reconciliations(correlationId);
    String filter = "matched";
    int matchedCount = reconRows.size();
    if (reconRows.isEmpty()) {
      reconRows=projections.recentReconciliations();
      filter = "fallback";
    }
    return ResponseEntity.ok(Map.of("runs", reconRows, "correlationIdFilter", filter,
        "matchedCount", matchedCount));
  }

  @PostMapping("/business-date:advance")
  public ResponseEntity<Map<String, Object>> advanceBusinessDate() {
    try {
      var entries = operations.journalEntries();
      java.math.BigDecimal debits = java.math.BigDecimal.ZERO;
      java.math.BigDecimal credits = java.math.BigDecimal.ZERO;
      for (FineractOperationsPort.JournalEntry entry : entries) {
        var amount = entry.amount();
        String entryType = entry.entryType();
        if ("DEBIT".equals(entryType)) debits = debits.add(amount);
        else if ("CREDIT".equals(entryType)) credits = credits.add(amount);
      }
      boolean balanced = debits.compareTo(credits) == 0;
      if (!balanced) {
        return ResponseEntity.ok(Map.of("status", "BLOCKED", "reason", "Ledger not balanced",
            "debits", debits.toPlainString(), "credits", credits.toPlainString()));
      }
      LocalDate nextDate = operations.businessDate().plusDays(1);
      operations.advanceBusinessDate(nextDate);
      return ResponseEntity.ok(Map.of("status", "ADVANCED",
          "newDate", nextDate.toString(),
          "ledgerBalanced", true,
          "journalEntries", entries.size()));
    } catch (Exception e) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", e.getMessage()));
    }
  }
}
