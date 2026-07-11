package local.bank.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TransferController {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final FineractAdapter fineract;
  private final AuditService audit;

  public TransferController(JdbcTemplate jdbc, ObjectMapper mapper, FineractAdapter fineract, AuditService audit) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.fineract = fineract;
    this.audit = audit;
  }

  @PostMapping({"/api/operations/v1/transfers", "/api/customer/v1/transfers"})
  @Transactional
  public ResponseEntity<Map<String, Object>> create(
      @AuthenticationPrincipal Jwt jwt,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestHeader(value = "X-Correlation-Id", required = false) String corrId,
      @RequestBody TransferRequest request) throws Exception {
    if (key == null || key.length() < 16 || key.length() > 128)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required");
    if (request.amount() == null || request.amount().signum() <= 0 || request.sourceAccountId().equals(request.destinationAccountId()))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transfer");

    if (corrId == null || corrId.isBlank()) corrId = MDC.get("correlationId");

    if (jwt.getIssuer() != null && jwt.getIssuer().toString().contains("bank-customer")) {
      var clientRows = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject=?",
          (rs, n) -> rs.getLong(1), jwt.getSubject());
      if (clientRows.isEmpty() || fineract.clientAccounts(clientRows.get(0)).stream()
          .noneMatch(a -> String.valueOf(a.get("id")).equals(request.sourceAccountId()))) {
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source account is not owned by customer");
      }
    }

    String hash = sha256(mapper.writeValueAsString(request));
    var existing = jdbc.query("SELECT request_hash, response_body, status_code FROM idempotency_record WHERE idempotency_key = ?",
        (rs, n) -> Map.<String, Object>of("hash", rs.getString(1), "body", rs.getString(2), "status", rs.getInt(3)), key);
    if (!existing.isEmpty()) {
      Map<String, Object> row = existing.get(0);
      if (!hash.equals(row.get("hash")))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key body mismatch");
      return ResponseEntity.status((Integer) row.get("status")).body(mapper.readValue((String) row.get("body"), Map.class));
    }

    String id = UUID.randomUUID().toString();
    Map<String, Object> response = Map.<String, Object>of("transferId", id, "status", "CREATED",
        "amount", request.amount().toPlainString(), "currency", request.currency(),
        "correlationId", corrId != null ? corrId : "");
    String body = mapper.writeValueAsString(response);
    jdbc.update("INSERT INTO idempotency_record(idempotency_key, request_hash, response_body, status_code) VALUES (?, ?, ?, ?)",
        key, hash, body, 202);
    jdbc.update("INSERT INTO transfer(transfer_id,idempotency_key,source_account_id,destination_account_id,amount,currency,status,subject,correlation_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
        UUID.fromString(id), key, request.sourceAccountId(), request.destinationAccountId(),
        request.amount(), request.currency(), "CREATED", jwt.getSubject(), corrId, hash);
    jdbc.update("INSERT INTO transfer_state_history(transfer_id,from_status,to_status,actor_type,actor_id,metadata) VALUES (?,?,?,?,?,?::jsonb)",
        UUID.fromString(id), null, "CREATED", "USER", jwt.getSubject(),
        "{\"idempotencyKey\":\"" + key + "\"}");
    jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)",
        UUID.randomUUID(), UUID.fromString(id), "transfer.status.changed", body);

    audit.record("TRANSFER_CREATED", "USER", jwt.getSubject(), "Transfer", id, "CREATE", "SUCCESS", null, response);

    return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
  }

  @GetMapping("/api/operations/v1/transfers/{transferId}")
  public Map<String, Object> get(@PathVariable UUID transferId) {
    var rows = jdbc.query(
        "SELECT transfer_id,status,amount,currency,core_reference,correlation_id FROM transfer WHERE transfer_id = ?",
        (rs, n) -> Map.<String, Object>of("transferId", rs.getString(1), "status", rs.getString(2),
            "amount", rs.getBigDecimal(3).toPlainString(), "currency", rs.getString(4),
            "coreReference", rs.getString(5), "correlationId", rs.getString(6) != null ? rs.getString(6) : ""),
        transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    return rows.get(0);
  }

  public record TransferRequest(String sourceAccountId, String destinationAccountId, BigDecimal amount, String currency, String reference) {}

  private static String sha256(String input) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(digest);
  }
}
