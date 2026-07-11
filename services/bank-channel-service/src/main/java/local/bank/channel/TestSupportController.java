package local.bank.channel;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@Profile({"local", "test"})
@RestController
@RequestMapping("/internal/test-support/v1")
@PreAuthorize("hasAuthority('ROLE_TEST_SUPPORT')")
public class TestSupportController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;

  public TestSupportController(JdbcTemplate jdbc, FineractAdapter fineract) {
    this.jdbc = jdbc;
    this.fineract = fineract;
  }

  @PostMapping("/fixtures:seed")
  public ResponseEntity<Map<String, Object>> seed() {
    Map<String, Object> result = new LinkedHashMap<>();
    String aliceSubject = "fixture-alice-" + UUID.randomUUID().toString().substring(0, 8);
    String bobSubject = "fixture-bob-" + UUID.randomUUID().toString().substring(0, 8);
    jdbc.update("INSERT INTO customer_identity(subject, fineract_client_id) VALUES (?, 1) ON CONFLICT DO NOTHING", aliceSubject);
    jdbc.update("INSERT INTO customer_identity(subject, fineract_client_id) VALUES (?, 2) ON CONFLICT DO NOTHING", bobSubject);
    result.put("customer.alice", Map.of("subject", aliceSubject, "fineractClientId", 1));
    result.put("customer.bob", Map.of("subject", bobSubject, "fineractClientId", 2));
    result.put("account.alice.primarySavings", Map.of("accountId", "1", "currency", "CNY"));
    result.put("account.bob.primarySavings", Map.of("accountId", "2", "currency", "CNY"));
    result.put("status", "SEEDED");
    return ResponseEntity.ok(result);
  }

  @PostMapping("/fixtures:reset")
  public ResponseEntity<Map<String, Object>> reset() {
    jdbc.update("DELETE FROM transfer_state_history");
    jdbc.update("DELETE FROM security_audit_event");
    jdbc.update("DELETE FROM transfer_receipt");
    jdbc.update("DELETE FROM notification");
    jdbc.update("DELETE FROM transfer_outbox");
    jdbc.update("DELETE FROM transfer_reversal");
    jdbc.update("DELETE FROM transfer");
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
    return ResponseEntity.ok(Map.of("status", "RESET"));
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
      String accountRef = parts.length >= 3 ? parts[2] : "primarySavings";
      return ResponseEntity.ok(Map.of("logicalRef", logicalRef, "accountId",
          accountRef.equals("primarySavings") ? "1" : "2", "currency", "CNY"));
    }
    return ResponseEntity.notFound().build();
  }

  @GetMapping("/pages")
  public ResponseEntity<List<Map<String, Object>>> pages() {
    return ResponseEntity.ok(List.of(
        Map.of("pageId", "customer.login", "routePattern", "/login"),
        Map.of("pageId", "customer.dashboard", "routePattern", "/dashboard"),
        Map.of("pageId", "customer.accounts", "routePattern", "/accounts"),
        Map.of("pageId", "customer.transfer.create", "routePattern", "/transfers/new"),
        Map.of("pageId", "customer.transfer.result", "routePattern", "/transfers/:paymentId"),
        Map.of("pageId", "customer.beneficiaries", "routePattern", "/beneficiaries"),
        Map.of("pageId", "customer.loans.apply", "routePattern", "/loans/apply"),
        Map.of("pageId", "operations.dashboard", "routePattern", "/dashboard"),
        Map.of("pageId", "operations.payments", "routePattern", "/payments"),
        Map.of("pageId", "operations.payments.detail", "routePattern", "/payments/:paymentId"),
        Map.of("pageId", "operations.approvals", "routePattern", "/approvals"),
        Map.of("pageId", "operations.reconciliation", "routePattern", "/reconciliation"),
        Map.of("pageId", "operations.eod", "routePattern", "/eod")));
  }

  @GetMapping("/assertions/payments/{paymentId}")
  public ResponseEntity<Map<String, Object>> assertPayment(@PathVariable UUID paymentId) {
    var transferRows = jdbc.query(
        "SELECT transfer_id, status, amount, currency, core_reference, correlation_id FROM transfer WHERE transfer_id = ?",
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
        "SELECT event_id, event_type, published_at FROM transfer_outbox WHERE transfer_id = ?",
        (rs, n) -> Map.<String, Object>of("eventId", rs.getString(1), "eventType", rs.getString(2),
            "publishedAt", rs.getString(3)),
        paymentId);

    Integer auditCount = jdbc.queryForObject(
        "SELECT count(*) FROM security_audit_event WHERE resource_id = ?",
        Integer.class, paymentId.toString());

    Integer idempotencyCount = jdbc.queryForObject(
        "SELECT count(*) FROM idempotency_record WHERE idempotency_key IN (SELECT idempotency_key FROM transfer WHERE transfer_id = ?)",
        Integer.class, paymentId);

    return ResponseEntity.ok(Map.of(
        "transfer", transferRows.get(0),
        "stateHistory", historyRows,
        "outbox", outboxRows,
        "auditCount", auditCount != null ? auditCount : 0,
        "idempotencyRecordExists", idempotencyCount != null && idempotencyCount > 0));
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
        "SELECT reconciliation_type, status, difference_count FROM reconciliation_run ORDER BY created_at DESC LIMIT 5",
        (rs, n) -> Map.<String, Object>of("type", rs.getString(1), "status", rs.getString(2),
            "differences", rs.getInt(3)));
    return ResponseEntity.ok(Map.of("runs", reconRows));
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
      return ResponseEntity.ok(Map.of("status", "ADVANCED",
          "newDate", LocalDate.now().plusDays(1).toString(),
          "ledgerBalanced", true,
          "journalEntries", entries.size()));
    } catch (Exception e) {
      return ResponseEntity.ok(Map.of("status", "FAILED", "reason", e.getMessage()));
    }
  }
}
