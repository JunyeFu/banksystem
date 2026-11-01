package local.bank.channel.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.format.annotation.DateTimeFormat;

import local.bank.channel.FineractAccountPort;
import local.bank.channel.audit.AuditService;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.identity.CustomerIdentityRepository;
import local.bank.channel.payments.statemachine.TransferStateMachine;

@RestController
public class TransferController {
  private static final int MAX_PAGE_SIZE = 100;
  private final TransferRepository repository;
  private final BeneficiaryRepository beneficiaries;
  private final CustomerIdentityRepository identities;
  private final ObjectMapper mapper;
  private final FineractAccountPort fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;
  private final TransferProcessor processor;
  private final TransactionTemplate transactions;

  public TransferController(TransferRepository repository, BeneficiaryRepository beneficiaries,
                            CustomerIdentityRepository identities, ObjectMapper mapper, FineractAccountPort fineract,
                            AuditService audit, TransferStateMachine stateMachine,
                            TransferProcessor processor,PlatformTransactionManager transactionManager) {
    this.repository = repository;
    this.beneficiaries = beneficiaries;
    this.identities = identities;
    this.mapper = mapper;
    this.fineract = fineract;
    this.audit = audit;
    this.stateMachine = stateMachine;
    this.processor = processor;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  @PostMapping("/api/customer/v1/transfers")
  public ResponseEntity<Map<String, Object>> createCustomer(
      @AuthenticationPrincipal Jwt jwt,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId,
      @RequestBody CustomerTransferRequest request) throws Exception {
    if (request.beneficiaryId() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "beneficiaryId is required");
    }
    assertCustomerOwnsSource(jwt, request.sourceAccountId());
    String destination = beneficiaries.destinationAccount(request.beneficiaryId(),jwt.getSubject())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
            "Beneficiary is unavailable or unresolved"));
    return createResolved(jwt, key, correlationId, "CUSTOMER_TRANSFER_CREATE", request, request.sourceAccountId(), destination,
        request.beneficiaryId(), request.amount(), request.currency(), request.reference());
  }

  @PostMapping("/api/operations/v1/transfers")
  public ResponseEntity<Map<String, Object>> createOperations(
      @AuthenticationPrincipal Jwt jwt,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId,
      @RequestBody OperationsTransferRequest request) throws Exception {
    return createResolved(jwt, key, correlationId, "OPERATIONS_TRANSFER_CREATE", request, request.sourceAccountId(),
        request.destinationAccountId(), null, request.amount(), request.currency(), request.reference());
  }

  private ResponseEntity<Map<String, Object>> createResolved(
      Jwt jwt, String key, String correlationId, String operation, Object originalRequest, String sourceAccountId,
      String destinationAccountId, UUID beneficiaryId, BigDecimal amount, String currency, String reference)
      throws Exception {
    validateWrite(key, correlationId, sourceAccountId, destinationAccountId, amount, currency);

    String hash = sha256(mapper.writeValueAsString(originalRequest));
    String subject = jwt.getSubject();
    String scopeKey = idempotencyScope(subject, operation, key);
    var existing = repository.idempotentResponse(subject,operation,key);
    if (existing.isPresent()) {
      var row = existing.get();
      if (!hash.equals(row.hash())) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key body mismatch");
      }
      return ResponseEntity.status(row.status()).body(mapper.readValue(row.body(), Map.class));
    }

    UUID transferId = UUID.randomUUID();
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("transferId", transferId.toString());
    response.put("status", "CREATED");
    response.put("amount", amount.toPlainString());
    response.put("currency", currency.toUpperCase());
    response.put("correlationId", correlationId == null ? "" : correlationId);
    String body = mapper.writeValueAsString(response);

    String metadata=mapper.writeValueAsString(Map.of("idempotencyKey", key));
    transactions.executeWithoutResult(tx -> {
      repository.create(transferId,key,scopeKey,subject,operation,hash,body,sourceAccountId,destinationAccountId,
          beneficiaryId,amount,currency.toUpperCase(),correlationId,blankToNull(reference));
      stateMachine.recordTransitionHistory(transferId, null, TransferStateMachine.Status.CREATED,
          "USER", jwt.getSubject(), null, metadata);
      repository.createdOutbox(transferId,body);
      audit.record("TRANSFER_CREATED", "USER", jwt.getSubject(), "Transfer", transferId.toString(),
          "CREATE", "SUCCESS", null, response);
    });
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
    return repository.page(new TransferRepository.Filter(jwt.getSubject(),pagination.status(),null,null,from,to),page,size);
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
    var filter=new TransferRepository.Filter(null,pagination.status(),normalizeCurrency(currency),blankToNull(query),from,to);
    Map<String, Object> result = new LinkedHashMap<>(repository.page(filter,page,size));
    result.put("summary", repository.summary(filter));
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
    var rows = repository.exportRows(new TransferRepository.Filter(null,request.status(),normalizeCurrency(currency),blankToNull(query),from,to));
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
    return repository.findCustomer(transferId,jwt.getSubject())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found"));
  }

  @PostMapping("/api/customer/v1/transfers/{transferId}/confirm")
  public Map<String, Object> confirmCustomer(@AuthenticationPrincipal Jwt jwt,
                                             @PathVariable UUID transferId) {
    if (!repository.owned(transferId,jwt.getSubject()))
      throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found");
    processor.process(transferId);
    return getCustomer(jwt, transferId);
  }

  @GetMapping("/api/operations/v1/transfers/{transferId}")
  public Map<String, Object> getOperations(@PathVariable UUID transferId) {
    Map<String,Object> result = new LinkedHashMap<>(repository.findOperations(transferId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found")));
    result.put("stateHistory",repository.history(transferId));
    result.put("outboxEvents",repository.outboxEvents(transferId));
    result.put("auditCount",repository.auditCount(transferId));
    return result;
  }

  private void assertCustomerOwnsSource(Jwt jwt, String sourceAccountId) {
    var clientRows = identities.clientIds(jwt.getSubject());
    if (clientRows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source account is not owned by customer");
    }
    boolean ownsSource = false;
    try {
      FineractAccountPort.SavingsAccount detail = fineract.accountDetails(Long.parseLong(sourceAccountId));
      // Account detail carries the authoritative core owner even when the
      // compact account-list representation omits or renames its ID field.
      Object coreClientId = detail.clientId();
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
          .anyMatch(account -> sourceAccountId.equals(String.valueOf(account.id())));
    }
    if (!ownsSource) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source account is not owned by customer");
    }
  }

  static void validateWrite(String key, String correlationId, String sourceAccountId,
                            String destinationAccountId, BigDecimal amount, String currency) {
    if (key == null || key.length() < 16 || key.length() > 128) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required");
    }
    if (correlationId == null || !correlationId.matches("[A-Za-z0-9._:-]{8,128}")) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-Id is required");
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

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static String sha256(String input) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(digest);
  }

  static String idempotencyScope(String subject, String operation, String key) {
    return subject + ":" + operation + ":" + key;
  }

  public record CustomerTransferRequest(String sourceAccountId, UUID beneficiaryId, BigDecimal amount,
                                        String currency, String reference) {}
  public record OperationsTransferRequest(String sourceAccountId, String destinationAccountId, BigDecimal amount,
                                          String currency, String reference) {}
  private record PageRequest(int page, int size, String status) {}
}
