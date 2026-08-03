package local.bank.channel.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.format.annotation.DateTimeFormat;

import local.bank.channel.FineractAdapter;
import local.bank.channel.audit.AuditService;
import local.bank.channel.payments.statemachine.TransferStateMachine;

@RestController
public class TransferController {
  private static final int MAX_PAGE_SIZE = 100;
  private static final String BASE_SELECT = """
      SELECT t.transfer_id,t.status,t.amount,t.currency,t.source_account_id,t.destination_account_id,
             t.beneficiary_id,b.display_name,b.account_last4,t.reference,t.core_reference,t.correlation_id,
             t.failure_code,t.failure_detail,t.failure_reason,t.created_at,t.updated_at,
             EXISTS(SELECT 1 FROM transfer_receipt r WHERE r.transfer_id=t.transfer_id) AS receipt_available
        FROM transfer_order t
        LEFT JOIN beneficiary b ON b.beneficiary_id=t.beneficiary_id
      """;

  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final FineractAdapter fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;

  public TransferController(JdbcTemplate jdbc, ObjectMapper mapper, FineractAdapter fineract,
                            AuditService audit, TransferStateMachine stateMachine) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.fineract = fineract;
    this.audit = audit;
    this.stateMachine = stateMachine;
  }

  @PostMapping("/api/customer/v1/transfers")
  @Transactional
  public ResponseEntity<Map<String, Object>> createCustomer(
      @AuthenticationPrincipal Jwt jwt,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId,
      @RequestBody CustomerTransferRequest request) throws Exception {
    if (request.beneficiaryId() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "beneficiaryId is required");
    }
    assertCustomerOwnsSource(jwt, request.sourceAccountId());
    var destinations = jdbc.query(
        "SELECT destination_account_id FROM beneficiary WHERE beneficiary_id=? AND subject=? AND destination_account_id IS NOT NULL",
        (rs, n) -> rs.getString(1), request.beneficiaryId(), jwt.getSubject());
    if (destinations.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Beneficiary is unavailable or unresolved");
    }
    return createResolved(jwt, key, correlationId, request, request.sourceAccountId(), destinations.get(0),
        request.beneficiaryId(), request.amount(), request.currency(), request.reference());
  }

  @PostMapping("/api/operations/v1/transfers")
  @Transactional
  public ResponseEntity<Map<String, Object>> createOperations(
      @AuthenticationPrincipal Jwt jwt,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId,
      @RequestBody OperationsTransferRequest request) throws Exception {
    return createResolved(jwt, key, correlationId, request, request.sourceAccountId(),
        request.destinationAccountId(), null, request.amount(), request.currency(), request.reference());
  }

  private ResponseEntity<Map<String, Object>> createResolved(
      Jwt jwt, String key, String correlationId, Object originalRequest, String sourceAccountId,
      String destinationAccountId, UUID beneficiaryId, BigDecimal amount, String currency, String reference)
      throws Exception {
    validateWrite(key, sourceAccountId, destinationAccountId, amount, currency);
    if (correlationId == null || correlationId.isBlank()) correlationId = MDC.get("correlationId");

    String hash = sha256(mapper.writeValueAsString(originalRequest));
    var existing = jdbc.query(
        "SELECT request_hash,response_body::text,http_status FROM idempotency_record WHERE scope_key=? AND expires_at>now()",
        (rs, n) -> Map.<String, Object>of("hash", rs.getString(1), "body", rs.getString(2), "status", rs.getInt(3)), key);
    if (!existing.isEmpty()) {
      Map<String, Object> row = existing.get(0);
      if (!hash.equals(row.get("hash"))) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key body mismatch");
      }
      return ResponseEntity.status((Integer) row.get("status"))
          .body(mapper.readValue((String) row.get("body"), Map.class));
    }

    UUID transferId = UUID.randomUUID();
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("transferId", transferId.toString());
    response.put("status", "CREATED");
    response.put("amount", amount.toPlainString());
    response.put("currency", currency.toUpperCase());
    response.put("correlationId", correlationId == null ? "" : correlationId);
    String body = mapper.writeValueAsString(response);

    jdbc.update("INSERT INTO idempotency_record(id,idempotency_key,scope_key,request_hash,status,http_status,status_code,response_headers,response_body,expires_at) "
            + "VALUES (?,?,?,?,'OK',202,202,'{}'::jsonb,?::jsonb,now()+interval '24 hours')",
        UUID.randomUUID(), key, key, hash, body);
    jdbc.update("INSERT INTO transfer_order(transfer_id,idempotency_key,source_account_id,destination_account_id,beneficiary_id,amount,currency,status,subject,correlation_id,request_hash,reference) "
            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        transferId, key, sourceAccountId, destinationAccountId, beneficiaryId, amount,
        currency.toUpperCase(), "CREATED", jwt.getSubject(), correlationId, hash, blankToNull(reference));
    stateMachine.recordTransitionHistory(transferId, null, TransferStateMachine.Status.CREATED,
        "USER", jwt.getSubject(), null, "{\"idempotencyKey\":\"" + key + "\"}");
    jdbc.update("INSERT INTO outbox_event(id,transfer_id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,status) VALUES (?,?,?,?,?,?,?::jsonb,?::jsonb,?)",
        UUID.randomUUID(), transferId, "Transfer", transferId, "transfer.status.changed", 1, body, "{}", "PENDING");
    audit.record("TRANSFER_CREATED", "USER", jwt.getSubject(), "Transfer", transferId.toString(),
        "CREATE", "SUCCESS", null, response);
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
  }

  @GetMapping("/api/customer/v1/transfers")
  public Map<String, Object> listCustomer(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    PageRequest pagination = pageRequest(status, page, size);
    validateDateRange(from, to);
    List<Object> parameters = new ArrayList<>();
    parameters.add(jwt.getSubject());
    String where = " WHERE t.subject=?";
    if (pagination.status() != null) {
      where += " AND t.status=?";
      parameters.add(pagination.status());
    }
    if (from != null) { where += " AND t.created_at>=?"; parameters.add(from); }
    if (to != null) { where += " AND t.created_at<=?"; parameters.add(to); }
    return transferPage(where, parameters, pagination);
  }

  @GetMapping("/api/operations/v1/transfers")
  public Map<String, Object> listOperations(
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false, name = "query") String query,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    PageRequest pagination = pageRequest(status, page, size);
    validateDateRange(from, to);
    List<Object> parameters = new ArrayList<>();
    List<String> predicates = new ArrayList<>();
    if (pagination.status() != null) {
      predicates.add("t.status=?");
      parameters.add(pagination.status());
    }
    String normalizedCurrency = normalizeCurrency(currency);
    if (normalizedCurrency != null) { predicates.add("t.currency=?"); parameters.add(normalizedCurrency); }
    String normalizedQuery = blankToNull(query);
    if (normalizedQuery != null) {
      predicates.add("(CAST(t.transfer_id AS text) ILIKE ? OR t.core_reference ILIKE ? OR t.correlation_id ILIKE ?)");
      String pattern = "%" + normalizedQuery.replace("%", "\\%").replace("_", "\\_") + "%";
      parameters.add(pattern); parameters.add(pattern); parameters.add(pattern);
    }
    if (from != null) { predicates.add("t.created_at>=?"); parameters.add(from); }
    if (to != null) { predicates.add("t.created_at<=?"); parameters.add(to); }
    String where = predicates.isEmpty() ? "" : " WHERE " + String.join(" AND ", predicates);
    Map<String, Object> result = new LinkedHashMap<>(transferPage(where, parameters, pagination));
    result.put("summary", transferSummary(where, parameters));
    return result;
  }

  @GetMapping(value = "/api/operations/v1/transfers/export", produces = "text/csv;charset=UTF-8")
  public ResponseEntity<String> exportOperations(
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false, name = "query") String query,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
    PageRequest request = pageRequest(status, 0, MAX_PAGE_SIZE);
    validateDateRange(from, to);
    List<Object> parameters = new ArrayList<>();
    List<String> predicates = new ArrayList<>();
    if (request.status() != null) { predicates.add("t.status=?"); parameters.add(request.status()); }
    String normalizedCurrency = normalizeCurrency(currency);
    if (normalizedCurrency != null) { predicates.add("t.currency=?"); parameters.add(normalizedCurrency); }
    String normalizedQuery = blankToNull(query);
    if (normalizedQuery != null) {
      predicates.add("(CAST(t.transfer_id AS text) ILIKE ? OR t.core_reference ILIKE ? OR t.correlation_id ILIKE ?)");
      String pattern = "%" + normalizedQuery.replace("%", "\\%").replace("_", "\\_") + "%";
      parameters.add(pattern); parameters.add(pattern); parameters.add(pattern);
    }
    if (from != null) { predicates.add("t.created_at>=?"); parameters.add(from); }
    if (to != null) { predicates.add("t.created_at<=?"); parameters.add(to); }
    String where = predicates.isEmpty() ? "" : " WHERE " + String.join(" AND ", predicates);
    var rows = jdbc.query(BASE_SELECT + where + " ORDER BY t.created_at DESC LIMIT 10000", this::transferRow, parameters.toArray());
    StringBuilder csv = new StringBuilder("transferId,status,amount,currency,coreReference,correlationId,createdAt\r\n");
    for (Map<String, Object> row : rows) {
      csv.append(csv(row.get("transferId"))).append(',').append(csv(row.get("status"))).append(',')
          .append(csv(row.get("amount"))).append(',').append(csv(row.get("currency"))).append(',')
          .append(csv(row.get("coreReference"))).append(',').append(csv(row.get("correlationId"))).append(',')
          .append(csv(row.get("createdAt"))).append("\r\n");
    }
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=transfer-monitoring.csv")
        .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8)).body(csv.toString());
  }

  @GetMapping("/api/customer/v1/transfers/{transferId}")
  public Map<String, Object> getCustomer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID transferId) {
    var rows = jdbc.query(BASE_SELECT + " WHERE t.transfer_id=? AND t.subject=?", this::transferRow,
        transferId, jwt.getSubject());
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    return rows.get(0);
  }

  @GetMapping("/api/operations/v1/transfers/{transferId}")
  public Map<String, Object> getOperations(@PathVariable UUID transferId) {
    var rows = jdbc.query(BASE_SELECT + " WHERE t.transfer_id=?", this::transferRow, transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    Map<String, Object> result = new LinkedHashMap<>(rows.get(0));
    result.put("stateHistory", jdbc.query(
        "SELECT from_status,to_status,reason_code,actor_type,actor_id,created_at FROM transfer_state_history WHERE transfer_id=? ORDER BY id",
        (rs, n) -> nullableMap(
            "fromStatus", rs.getString(1), "toStatus", rs.getString(2), "reasonCode", rs.getString(3),
            "actorType", rs.getString(4), "actorId", rs.getString(5), "createdAt", rs.getObject(6).toString()), transferId));
    result.put("outboxEvents", jdbc.query(
        "SELECT id,event_type,status,attempt_count,published_at,created_at,updated_at FROM outbox_event WHERE aggregate_id=? ORDER BY created_at",
        (rs, n) -> nullableMap(
            "eventId", rs.getString(1), "eventType", rs.getString(2), "status", rs.getString(3),
            "attemptCount", rs.getInt(4), "publishedAt", rs.getObject(5),
            "createdAt", rs.getObject(6).toString(), "updatedAt", rs.getObject(7).toString()), transferId));
    Integer auditCount = jdbc.queryForObject(
        "SELECT count(*) FROM security_audit_event WHERE resource_id=?", Integer.class, transferId.toString());
    result.put("auditCount", auditCount == null ? 0 : auditCount);
    return result;
  }

  private Map<String, Object> transferPage(String where, List<Object> parameters, PageRequest page) {
    Long total = jdbc.queryForObject("SELECT count(*) FROM transfer_order t" + where, Long.class,
        parameters.toArray());
    List<Object> listParameters = new ArrayList<>(parameters);
    listParameters.add(page.size());
    listParameters.add(page.page() * page.size());
    var rows = jdbc.query(BASE_SELECT + where + " ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
        this::transferRow, listParameters.toArray());
    long count = total == null ? 0L : total;
    return Map.of("items", rows, "page", page.page(), "size", page.size(), "totalItems", count,
        "totalPages", count == 0 ? 0 : (count + page.size() - 1) / page.size());
  }

  private Map<String, Object> transferSummary(String where, List<Object> parameters) {
    return jdbc.queryForObject("SELECT count(*),count(*) FILTER (WHERE t.status='SETTLED'),"
            + "count(*) FILTER (WHERE t.status IN ('CREATED','VALIDATING','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','REVERSAL_PENDING')),"
            + "count(*) FILTER (WHERE t.status='RISK_REVIEW'),"
            + "count(*) FILTER (WHERE t.status IN ('FAILED','TIMED_OUT','RETURNED','REVERSED')) FROM transfer_order t" + where,
        (rs, rowNum) -> Map.of("total", rs.getLong(1), "settled", rs.getLong(2), "processing", rs.getLong(3),
            "riskReview", rs.getLong(4), "failed", rs.getLong(5)), parameters.toArray());
  }

  private Map<String, Object> transferRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("transferId", rs.getString(1));
    row.put("status", rs.getString(2));
    row.put("amount", rs.getBigDecimal(3).toPlainString());
    row.put("currency", rs.getString(4));
    row.put("sourceAccountId", rs.getString(5));
    row.put("destinationAccountId", rs.getString(6));
    putIfPresent(row, "beneficiaryId", rs.getString(7));
    putIfPresent(row, "beneficiaryName", rs.getString(8));
    String last4 = rs.getString(9);
    if (last4 != null) row.put("maskedDestinationAccount", "****" + last4);
    putIfPresent(row, "reference", rs.getString(10));
    putIfPresent(row, "coreReference", rs.getString(11));
    putIfPresent(row, "correlationId", rs.getString(12));
    putIfPresent(row, "failureCode", rs.getString(13));
    String failureDetail = rs.getString(14);
    if (failureDetail == null) failureDetail = rs.getString(15);
    putIfPresent(row, "failureDetail", failureDetail);
    row.put("createdAt", rs.getObject(16).toString());
    row.put("updatedAt", rs.getObject(17).toString());
    row.put("receiptAvailable", rs.getBoolean(18));
    return row;
  }

  private void assertCustomerOwnsSource(Jwt jwt, String sourceAccountId) {
    var clientRows = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject=?",
        (rs, n) -> rs.getLong(1), jwt.getSubject());
    if (clientRows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source account is not owned by customer");
    }
    boolean ownsSource = false;
    try {
      Map<String, Object> detail = fineract.accountDetails(Long.parseLong(sourceAccountId));
      // Account detail carries the authoritative core owner even when the
      // compact account-list representation omits or renames its ID field.
      Object coreClientId = detail.get("clientId");
      ownsSource = coreClientId != null && String.valueOf(clientRows.get(0)).equals(String.valueOf(coreClientId));
    } catch (RuntimeException ignored) {
      // The controlled list fallback preserves compatibility with older local
      // Fineract fixtures that do not expose clientId on account detail.
    }
    if (!ownsSource) {
      // Fineract account-list responses differ by version: some expose `id`,
      // others only `accountId` or `savingsAccountId`.  Match all supported
      // forms before rejecting a source.
      ownsSource = fineract.clientAccounts(clientRows.get(0)).stream()
          .anyMatch(account -> sourceAccountId.equals(String.valueOf(account.getOrDefault("id", account.getOrDefault("accountId", account.get("savingsAccountId"))))));
    }
    if (!ownsSource) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source account is not owned by customer");
    }
  }

  private static void validateWrite(String key, String sourceAccountId, String destinationAccountId,
                                    BigDecimal amount, String currency) {
    if (key == null || key.length() < 16 || key.length() > 128) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required");
    }
    if (sourceAccountId == null || destinationAccountId == null || sourceAccountId.equals(destinationAccountId)
        || amount == null || amount.signum() <= 0 || amount.scale() > 2
        || currency == null || !currency.matches("[A-Za-z]{3}")) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transfer");
    }
  }

  private static PageRequest pageRequest(String status, int page, int size) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid pagination");
    }
    String normalized = blankToNull(status);
    if (normalized != null) {
      try {
        normalized = TransferStateMachine.Status.valueOf(normalized.toUpperCase()).name();
      } catch (IllegalArgumentException ex) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transfer status");
      }
    }
    return new PageRequest(page, size, normalized);
  }

  private static void validateDateRange(OffsetDateTime from, OffsetDateTime to) {
    if (from != null && to != null && from.isAfter(to)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date range");
    }
  }

  private static String normalizeCurrency(String currency) {
    String normalized = blankToNull(currency);
    if (normalized == null) return null;
    normalized = normalized.toUpperCase();
    if (!normalized.matches("[A-Z]{3}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid currency");
    return normalized;
  }

  private static String csv(Object value) {
    String text = value == null ? "" : String.valueOf(value);
    return '"' + text.replace("\"", "\"\"") + '"';
  }

  private static Map<String, Object> nullableMap(Object... entries) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int index = 0; index < entries.length; index += 2) {
      Object value = entries[index + 1];
      if (value != null) result.put((String) entries[index], value);
    }
    return result;
  }

  private static void putIfPresent(Map<String, Object> target, String key, String value) {
    if (value != null && !value.isBlank()) target.put(key, value);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static String sha256(String input) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(digest);
  }

  public record CustomerTransferRequest(String sourceAccountId, UUID beneficiaryId, BigDecimal amount,
                                        String currency, String reference) {}
  public record OperationsTransferRequest(String sourceAccountId, String destinationAccountId, BigDecimal amount,
                                          String currency, String reference) {}
  private record PageRequest(int page, int size, String status) {}
}
