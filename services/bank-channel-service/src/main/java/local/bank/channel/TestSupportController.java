package local.bank.channel;

import java.io.InputStream;
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
        Object currency = firstAccount.getOrDefault("currencyCode", firstAccount.getOrDefault("currency", "CNY"));
        return ResponseEntity.ok(Map.of("logicalRef", logicalRef, "accountId", accountId, "currency", currency, "clientId", clientId));
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
