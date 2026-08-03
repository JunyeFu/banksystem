package local.bank.channel;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientResponseException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import local.bank.channel.audit.AuditService;
import org.springframework.transaction.annotation.Transactional;

@Profile({"local", "test"})
@RestController
@RequestMapping("/internal/test-support/v1")
@PreAuthorize("hasAuthority('ROLE_TEST_SUPPORT')")
public class TestSupportController {
  public record IdentityLinkRequest(String subject, String logicalRef) { }
  /**
   * Local/test-only browser-suite fixture.  Core-money changes are always
   * performed through FineractAdapter; this controller never writes a
   * Fineract database directly.
   */
  public record CustomerScenarioRequest(String subject, String logicalCustomerRef, String destinationCustomerRef) { }
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  private final AuditService audit;
  private final int savingsProductId;

  public TestSupportController(JdbcTemplate jdbc, FineractAdapter fineract, AuditService audit,
      @Value("${fineract.savings-product-id:1}") int savingsProductId) {
    this.jdbc = jdbc;
    this.fineract = fineract;
    this.audit = audit;
    this.savingsProductId = savingsProductId;
  }

  @PostMapping("/fixtures:seed")
  public ResponseEntity<Map<String, Object>> seed() {
    Map<String, Object> result = new LinkedHashMap<>();
    Map<String, Map<String, Object>> fixtures = loadBaselineFixtures();
    if (fixtures == null) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", "Cannot load baseline-fixtures.yaml"));
    }
    Map<String, Object> aliceFixture = fixtures.get("customer.alice");
    Map<String, Object> bobFixture = fixtures.get("customer.bob");
    if (aliceFixture == null || bobFixture == null) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", "customer.alice or customer.bob missing from YAML"));
    }
    Map<String, Object> aliceAccountFixture = fixtures.get("account.alice.primarySavings");
    Map<String, Object> bobAccountFixture = fixtures.get("account.bob.primarySavings");
    if (aliceAccountFixture == null || bobAccountFixture == null) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", "account fixtures missing from YAML"));
    }
    String aliceSubject = "fixture-alice-" + UUID.randomUUID().toString().substring(0, 8);
    String bobSubject = "fixture-bob-" + UUID.randomUUID().toString().substring(0, 8);
    long aliceClientId = createClientAndIdentity(aliceFixture, aliceSubject);
    long bobClientId = createClientAndIdentity(bobFixture, bobSubject);
    long aliceAccountId = createSavingsAccountAndReturnId(aliceClientId, aliceAccountFixture);
    long bobAccountId = createSavingsAccountAndReturnId(bobClientId, bobAccountFixture);
    result.put("customer.alice", Map.of("subject", aliceSubject, "fineractClientId", aliceClientId));
    result.put("customer.bob", Map.of("subject", bobSubject, "fineractClientId", bobClientId));
    result.put("account.alice.primarySavings", Map.of("accountId", aliceAccountId, "currency", aliceAccountFixture.getOrDefault("currency", "CNY")));
    result.put("account.bob.primarySavings", Map.of("accountId", bobAccountId, "currency", bobAccountFixture.getOrDefault("currency", "CNY")));
    result.put("status", "SEEDED");
    audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "Fixture", "all", "SEED", "SUCCESS", null, Map.of("aliceClientId", aliceClientId, "bobClientId", bobClientId));
    return ResponseEntity.ok(result);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Map<String, Object>> loadBaselineFixtures() {
    try (InputStream in = new ClassPathResource("fixtures/baseline-fixtures.yaml").getInputStream()) {
      ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
      Map<String, Object> root = yamlMapper.readValue(in, Map.class);
      Object fixturesObj = root.get("fixtures");
      if (!(fixturesObj instanceof Map<?, ?> rawMap)) return null;
      Map<String, Map<String, Object>> result = new LinkedHashMap<>();
      for (var entry : rawMap.entrySet()) {
        if (entry.getValue() instanceof Map<?, ?> m) {
          result.put(String.valueOf(entry.getKey()), (Map<String, Object>) m);
        }
      }
      return result;
    } catch (Exception e) {
      try (InputStream in = new ClassPathResource("../../../../contracts/fixtures/baseline-fixtures.yaml").getInputStream()) {
        ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
        Map<String, Object> root = yamlMapper.readValue(in, Map.class);
        Object fixturesObj = root.get("fixtures");
        if (!(fixturesObj instanceof Map<?, ?> rawMap)) return null;
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (var entry : rawMap.entrySet()) {
          if (entry.getValue() instanceof Map<?, ?> m) {
            result.put(String.valueOf(entry.getKey()), (Map<String, Object>) m);
          }
        }
        return result;
      } catch (Exception ex) {
        return null;
      }
    }
  }

  private long createClientAndIdentity(Map<String, Object> customerFixture, String subject) {
    String displayName = String.valueOf(customerFixture.getOrDefault("displayName", "Test Customer"));
    Map<String, Object> clientResult = fineract.createClient(displayName, null);
    long clientId = ((Number) clientResult.get("clientId")).longValue();
    jdbc.update("INSERT INTO customer_identity(subject, fineract_client_id) VALUES (?, ?) ON CONFLICT DO NOTHING", subject, clientId);
    return clientId;
  }

  private long createSavingsAccountAndReturnId(long clientId, Map<String, Object> accountFixture) {
    String currency = String.valueOf(accountFixture.getOrDefault("currency", "CNY"));
    int productId = accountFixture.containsKey("fineractProductId")
        ? ((Number) accountFixture.get("fineractProductId")).intValue()
        : savingsProductId;
    Map<String, Object> accountResult = fineract.createSavingsAccount(clientId, productId, currency);
    long accountId = ((Number) accountResult.get("savingsId")).longValue();
    try {
      fineract.savingsCommand(accountId, "approve", Map.of());
      fineract.savingsCommand(accountId, "activate", Map.of());
    } catch (Exception ignored) { }
    return accountId;
  }

  @PostMapping("/fixtures:reset")
  public ResponseEntity<Map<String, Object>> reset() {
    jdbc.update("DELETE FROM transfer_state_history");
    jdbc.update("DELETE FROM security_audit_event");
    jdbc.update("DELETE FROM transfer_receipt");
    jdbc.update("DELETE FROM notification");
    jdbc.update("DELETE FROM beneficiary");
    jdbc.update("DELETE FROM ledger_entry");
    jdbc.update("DELETE FROM outbox_event");
    jdbc.update("DELETE FROM transfer_reversal");
    jdbc.update("DELETE FROM transfer_order");
    jdbc.update("DELETE FROM idempotency_record");
    jdbc.update("DELETE FROM clearing_payment");
    jdbc.update("DELETE FROM risk_decision");
    jdbc.update("DELETE FROM loan_document");
    jdbc.update("DELETE FROM loan_approval");
    jdbc.update("DELETE FROM loan_application");
    jdbc.update("DELETE FROM dead_letter_event");
    jdbc.update("DELETE FROM reconciliation_run");
    jdbc.update("DELETE FROM eod_run");
    jdbc.update("DELETE FROM customer_identity WHERE subject LIKE 'fixture-%'");
    audit.record(AuditService.EVENT_FIXTURE_RESET, "SYSTEM", "test-support", "Fixture", "all", "RESET", "SUCCESS", null, null);
    return ResponseEntity.ok(Map.of("status", "RESET"));
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
    String prefix = request.logicalRef().replace("customer.", "fixture-") + "%";
    List<Long> clientIds = jdbc.query(
        "SELECT fineract_client_id FROM customer_identity WHERE subject LIKE ? ORDER BY created_at DESC LIMIT 1",
        (rs, n) -> rs.getLong(1), prefix);
    if (clientIds.isEmpty()) return ResponseEntity.notFound().build();
    jdbc.update("DELETE FROM customer_identity WHERE fineract_client_id = ? AND subject LIKE 'fixture-%'", clientIds.get(0));
    jdbc.update("""
        INSERT INTO customer_identity(subject, fineract_client_id) VALUES (?, ?)
        ON CONFLICT (subject) DO UPDATE SET fineract_client_id = EXCLUDED.fineract_client_id
        """, request.subject(), clientIds.get(0));
    audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerIdentity",
        request.logicalRef(), "LINK", "SUCCESS", null, Map.of("logicalRef", request.logicalRef()));
    return ResponseEntity.ok(Map.of("status", "LINKED", "logicalRef", request.logicalRef()));
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
    List<Long> sourceClients = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject=?", (rs, n) -> rs.getLong(1), request.subject());
    List<Long> destinationClients = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject LIKE 'fixture-bob-%' ORDER BY created_at DESC LIMIT 1", (rs, n) -> rs.getLong(1));
    if (sourceClients.isEmpty() || destinationClients.isEmpty()) {
      return ResponseEntity.status(409).body(Map.of("status", "REJECTED", "reason", "FIXTURE_IDENTITY_NOT_READY"));
    }
    String stage = "LOAD_ACCOUNTS";
    try {
      Map<String, Object> source = primarySavingsAccount(sourceClients.get(0));
      Map<String, Object> destination = primarySavingsAccount(destinationClients.get(0));
      stage = "VALIDATE_DESTINATION";
      long sourceAccountId = accountId(source);
      long destinationAccountId = accountId(destination);
      stage = "ACTIVATE_SOURCE";
      ensureActiveSavings(sourceAccountId, source);
      stage = "ACTIVATE_DESTINATION";
      ensureActiveSavings(destinationAccountId, destination);
      String destinationNumber = accountNumber(destination);
      if (destinationNumber == null || destinationNumber.length() < 6) {
        return ResponseEntity.status(409).body(Map.of("status", "REJECTED", "reason", "DESTINATION_ACCOUNT_NOT_READY"));
      }
      stage = "CHECK_TRANSACTIONS";
      boolean hasTransactions;
      try {
        hasTransactions = !fineract.savingsTransactions(sourceAccountId, null, null).isEmpty();
      } catch (Exception ignored) {
        // Some local Fineract versions do not expose the transaction-search
        // endpoint. The idempotent scenario still uses the official deposit
        // command; a unique scenario marker prevents duplicate deposits.
        hasTransactions = jdbc.queryForObject("SELECT COUNT(*) FROM security_audit_event WHERE resource_type='CustomerScenario' AND resource_id=? AND action='FUND' AND outcome='SUCCESS'", Integer.class, request.subject()) > 0;
      }
      if (!hasTransactions) {
        stage = "FUND_SOURCE";
        fineract.savingsCommand(sourceAccountId, "deposit", Map.of(
            "transactionAmount", new BigDecimal("1000.00")));
        audit.record(AuditService.EVENT_FIXTURE_SEEDED, "SYSTEM", "test-support", "CustomerScenario", request.subject(),
            "FUND", "SUCCESS", null, Map.of("amount", "1000.00", "currency", "CNY"));
      }
      String accountToken = sha256(destinationNumber);
      stage = "UPSERT_BENEFICIARY";
      UUID beneficiaryId = UUID.nameUUIDFromBytes(("i10-scenario-beneficiary|" + request.subject() + "|" + accountToken).getBytes(StandardCharsets.UTF_8));
      jdbc.update("""
          INSERT INTO beneficiary(beneficiary_id,subject,account_token,account_last4,display_name,destination_account_id)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT (subject,account_token) DO UPDATE SET display_name=EXCLUDED.display_name,
            destination_account_id=EXCLUDED.destination_account_id,updated_at=now()
          """, beneficiaryId, request.subject(), accountToken,
          destinationNumber.substring(destinationNumber.length() - 4), "I10测试收款人", String.valueOf(destinationAccountId));
      UUID notificationId = UUID.nameUUIDFromBytes(("i10-scenario-notification|" + request.subject()).getBytes(StandardCharsets.UTF_8));
      stage = "UPSERT_NOTIFICATION";
      jdbc.update("""
          INSERT INTO notification(notification_id,subject,notification_type,payload)
          VALUES (?,?,?,?) ON CONFLICT (notification_id) DO NOTHING
          """, notificationId, request.subject(), "SECURITY", "{\"source\":\"I10_SCENARIO\"}");
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
    int notifications = jdbc.update("DELETE FROM notification WHERE subject=? AND payload LIKE '%I10_SCENARIO%'", request.subject());
    int beneficiaries = jdbc.update("DELETE FROM beneficiary WHERE subject=? AND display_name='I10测试收款人'", request.subject());
    return ResponseEntity.ok(Map.of("status", "CLEARED", "notifications", notifications, "beneficiaries", beneficiaries));
  }

  private Map<String, Object> primarySavingsAccount(long clientId) {
    List<Map<String, Object>> accounts = fineract.clientAccounts(clientId);
    if (accounts.isEmpty()) throw new IllegalStateException("No savings account");
    return fineract.accountDetails(accountId(accounts.get(0)));
  }

  @SuppressWarnings("unchecked")
  private void ensureActiveSavings(long accountId, Map<String, Object> account) {
    Object status = account.get("status");
    String code = status instanceof Map<?, ?> map ? String.valueOf(((Map<String, Object>) map).getOrDefault("code", "")) : String.valueOf(status);
    if (code.toLowerCase(java.util.Locale.ROOT).contains("active")) return;
    fineract.savingsCommand(accountId, "approve", Map.of());
    fineract.savingsCommand(accountId, "activate", Map.of());
  }

  private static long accountId(Map<String, Object> account) {
    Object id = account.getOrDefault("id", account.getOrDefault("accountId", account.get("savingsAccountId")));
    if (!(id instanceof Number number)) throw new IllegalStateException("Account id missing");
    return number.longValue();
  }

  private static String accountNumber(Map<String, Object> account) {
    Object value = account.getOrDefault("accountNo", account.get("accountNumber"));
    return value == null ? null : String.valueOf(value).trim();
  }

  private static String sha256(String input) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
    StringBuilder output = new StringBuilder();
    for (byte value : digest) output.append(String.format("%02x", value));
    return output.toString();
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
      var rows = jdbc.query(
          "SELECT subject, fineract_client_id FROM customer_identity WHERE subject LIKE ? ORDER BY created_at DESC LIMIT 1",
          (rs, n) -> Map.<String, Object>of("logicalRef", logicalRef, "subject", rs.getString(1),
              "fineractClientId", rs.getLong(2)),
          logicalRef.replace("customer.", "fixture-") + "%");
      if (rows.isEmpty()) return ResponseEntity.notFound().build();
      return ResponseEntity.ok(rows.get(0));
    }
    if (logicalRef.startsWith("account.")) {
      String[] parts = logicalRef.split("\\.");
      String customerPrefix = parts.length >= 2 ? "fixture-" + parts[1] : "fixture-";
      var customerRows = jdbc.query(
          "SELECT subject, fineract_client_id FROM customer_identity WHERE subject LIKE ? ORDER BY created_at DESC LIMIT 1",
          (rs, n) -> Map.<String, Object>of("subject", rs.getString(1), "fineractClientId", rs.getLong(2)),
          customerPrefix + "%");
      if (customerRows.isEmpty()) return ResponseEntity.notFound().build();
      long clientId = (Long) customerRows.get(0).get("fineractClientId");
      try {
        var accounts = fineract.clientAccounts(clientId);
        if (accounts.isEmpty()) return ResponseEntity.notFound().build();
        var firstAccount = accounts.get(0);
        Object accountId = firstAccount.getOrDefault("id", firstAccount.getOrDefault("accountId", 0));
        Object accountNumber = firstAccount.getOrDefault("accountNo", firstAccount.getOrDefault("accountNumber", ""));
        Object currency = firstAccount.getOrDefault("currencyCode", firstAccount.getOrDefault("currency", "CNY"));
        return ResponseEntity.ok(Map.of("logicalRef", logicalRef, "accountId", accountId, "accountNumber", accountNumber, "currency", currency, "clientId", clientId));
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
    var transferRows = jdbc.query(
        "SELECT transfer_id, status, amount, currency, core_reference, correlation_id FROM transfer_order WHERE transfer_id = ?",
        (rs, n) -> Map.<String, Object>of("transferId", rs.getString(1), "status", rs.getString(2),
            "amount", rs.getBigDecimal(3).toPlainString(), "currency", rs.getString(4),
            "coreReference", rs.getString(5), "correlationId", rs.getString(6)),
        paymentId);
    if (transferRows.isEmpty()) return ResponseEntity.notFound().build();

    var historyRows = jdbc.query(
        "SELECT from_status, to_status, actor_type, actor_id, created_at FROM transfer_state_history WHERE transfer_id = ? ORDER BY id",
        (rs, n) -> Map.<String, Object>of("fromStatus", rs.getString(1), "toStatus", rs.getString(2),
            "actorType", rs.getString(3), "actorId", rs.getString(4), "createdAt", rs.getString(5)),
        paymentId);

    var outboxRows = jdbc.query(
        "SELECT id, event_type, published_at FROM outbox_event WHERE aggregate_id = ?",
        (rs, n) -> Map.<String, Object>of("eventId", rs.getString(1), "eventType", rs.getString(2),
            "publishedAt", rs.getString(3)),
        paymentId);

    Integer auditCount = jdbc.queryForObject(
        "SELECT count(*) FROM security_audit_event WHERE resource_id = ?",
        Integer.class, paymentId.toString());

    Integer idempotencyCount = jdbc.queryForObject(
        "SELECT count(*) FROM idempotency_record WHERE scope_key IN (SELECT idempotency_key FROM transfer_order WHERE transfer_id = ?)",
        Integer.class, paymentId);

    Map<String, Object> transfer = transferRows.get(0);
    String coreReference = (String) transfer.get("coreReference");
    boolean coreTransactionVerified = false;
    boolean coreAmountMatched = false;
    int coreEntryCount = 0;
    if (coreReference != null && !coreReference.isEmpty()) {
      try {
        var journal = fineract.journalEntries();
        var matchingEntries = journal.stream().filter(e -> {
          Object id = e.get("id");
          if (id == null) id = e.get("transactionId");
          return id != null && coreReference.equals(String.valueOf(id));
        }).toList();
        coreTransactionVerified = !matchingEntries.isEmpty();
        coreEntryCount = matchingEntries.size();
        coreAmountMatched = matchingEntries.stream().anyMatch(e ->
            transfer.get("amount").equals(String.valueOf(e.get("amount"))));
      } catch (Exception e) {
        coreTransactionVerified = false;
      }
    }

    return ResponseEntity.ok(Map.of(
        "transfer", transfer,
        "stateHistory", historyRows,
        "outbox", outboxRows,
        "auditCount", auditCount != null ? auditCount : 0,
        "idempotencyRecordExists", idempotencyCount != null && idempotencyCount > 0,
        "coreTransactionVerified", coreTransactionVerified,
        "coreTransactionFound", coreTransactionVerified,
        "coreAmountMatched", coreAmountMatched,
        "coreEntryCount", coreEntryCount));
  }

  @GetMapping("/assertions/ledger/{correlationId}")
  public ResponseEntity<Map<String, Object>> assertLedger(@PathVariable String correlationId) {
    var localEntries = jdbc.query(
        "SELECT entry_id, account_id, debit, credit, transfer_id FROM ledger_entry WHERE correlation_id = ? ORDER BY created_at",
        (rs, n) -> Map.<String, Object>of(
            "entryId", rs.getString(1),
            "accountId", rs.getLong(2),
            "debit", rs.getBigDecimal(3).toPlainString(),
            "credit", rs.getBigDecimal(4).toPlainString(),
            "transferId", rs.getString(5) != null ? rs.getString(5) : ""),
        correlationId);
    java.math.BigDecimal localDebits = java.math.BigDecimal.ZERO;
    java.math.BigDecimal localCredits = java.math.BigDecimal.ZERO;
    for (Map<String, Object> e : localEntries) {
      localDebits = localDebits.add(new java.math.BigDecimal((String) e.get("debit")));
      localCredits = localCredits.add(new java.math.BigDecimal((String) e.get("credit")));
    }
    boolean localBalanced = localDebits.compareTo(localCredits) == 0;

    var coreEntries = fineract.journalEntries();
    java.math.BigDecimal coreDebits = java.math.BigDecimal.ZERO;
    java.math.BigDecimal coreCredits = java.math.BigDecimal.ZERO;
    for (Map<String, Object> entry : coreEntries) {
      var amount = new java.math.BigDecimal(String.valueOf(entry.getOrDefault("amount", "0")));
      Object entryTypeObj = entry.get("entryType");
      String entryType = "";
      if (entryTypeObj instanceof Map<?, ?> etm) entryType = String.valueOf(etm.get("value"));
      else entryType = String.valueOf(entryTypeObj);
      if ("DEBIT".equals(entryType)) coreDebits = coreDebits.add(amount);
      else if ("CREDIT".equals(entryType)) coreCredits = coreCredits.add(amount);
    }
    boolean coreBalanced = coreDebits.compareTo(coreCredits) == 0;

    return ResponseEntity.ok(Map.of(
        "localEntries", localEntries,
        "localEntryCount", localEntries.size(),
        "localDebits", localDebits.toPlainString(),
        "localCredits", localCredits.toPlainString(),
        "localBalanced", localBalanced,
        "coreEntries", coreEntries.size(),
        "coreDebits", coreDebits.toPlainString(),
        "coreCredits", coreCredits.toPlainString(),
        "coreBalanced", coreBalanced));
  }

  @GetMapping("/assertions/reconciliation/{correlationId}")
  public ResponseEntity<Map<String, Object>> assertReconciliation(@PathVariable String correlationId) {
    var reconRows = jdbc.query(
        "SELECT reconciliation_type, status, difference_count, details FROM reconciliation_run " +
        "WHERE details::jsonb ->> 'correlationId' = ? ORDER BY created_at DESC LIMIT 5",
        (rs, n) -> {
          var m = new java.util.LinkedHashMap<String, Object>();
          m.put("type", rs.getString(1));
          m.put("status", rs.getString(2));
          m.put("differences", rs.getInt(3));
          m.put("details", rs.getString(4));
          return m;
        },
        correlationId);
    String filter = "matched";
    int matchedCount = reconRows.size();
    if (reconRows.isEmpty()) {
      reconRows = jdbc.query(
          "SELECT reconciliation_type, status, difference_count, details FROM reconciliation_run ORDER BY created_at DESC LIMIT 5",
          (rs, n) -> {
            var m = new java.util.LinkedHashMap<String, Object>();
            m.put("type", rs.getString(1));
            m.put("status", rs.getString(2));
            m.put("differences", rs.getInt(3));
            m.put("details", rs.getString(4));
            return m;
          });
      filter = "fallback";
    }
    return ResponseEntity.ok(Map.of("runs", reconRows, "correlationIdFilter", filter,
        "matchedCount", matchedCount));
  }

  @PostMapping("/business-date:advance")
  public ResponseEntity<Map<String, Object>> advanceBusinessDate() {
    try {
      var entries = fineract.journalEntries();
      java.math.BigDecimal debits = java.math.BigDecimal.ZERO;
      java.math.BigDecimal credits = java.math.BigDecimal.ZERO;
      for (Map<String, Object> entry : entries) {
        var amount = new java.math.BigDecimal(String.valueOf(entry.getOrDefault("amount", "0")));
        Object entryTypeObj = entry.get("entryType");
        String entryType = "";
        if (entryTypeObj instanceof Map<?, ?> etm) entryType = String.valueOf(etm.get("value"));
        else entryType = String.valueOf(entryTypeObj);
        if ("DEBIT".equals(entryType)) debits = debits.add(amount);
        else if ("CREDIT".equals(entryType)) credits = credits.add(amount);
      }
      boolean balanced = debits.compareTo(credits) == 0;
      if (!balanced) {
        return ResponseEntity.ok(Map.of("status", "BLOCKED", "reason", "Ledger not balanced",
            "debits", debits.toPlainString(), "credits", credits.toPlainString()));
      }
      LocalDate nextDate = fineract.businessDate().plusDays(1);
      fineract.advanceBusinessDate(nextDate);
      return ResponseEntity.ok(Map.of("status", "ADVANCED",
          "newDate", nextDate.toString(),
          "ledgerBalanced", true,
          "journalEntries", entries.size()));
    } catch (Exception e) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", e.getMessage()));
    }
  }
}
