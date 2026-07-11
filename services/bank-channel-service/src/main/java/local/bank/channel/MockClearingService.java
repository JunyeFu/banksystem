package local.bank.channel;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.HexFormat;

@Service
public class MockClearingService {
  private static final Set<String> V4_SCENARIOS = Set.of(
      "SUCCESS_IMMEDIATE", "SUCCESS_DELAYED", "REJECT_ACCOUNT_INVALID", "REJECT_BANK_UNAVAILABLE",
      "TIMEOUT_THEN_SUCCESS", "TIMEOUT_THEN_FAIL", "RETURN_AFTER_SETTLEMENT",
      "DUPLICATE_CALLBACK", "OUT_OF_ORDER_CALLBACK");

  private final JdbcTemplate jdbc;
  private final String secret;

  public MockClearingService(JdbcTemplate jdbc, @Value("${clearing.callback-secret}") String secret) {
    this.jdbc = jdbc;
    this.secret = secret;
  }

  @Transactional
  public Map<String, Object> submit(UUID transferId, String scenario, String key) {
    if (!V4_SCENARIOS.contains(scenario))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported clearing scenario: " + scenario + ". Supported: " + V4_SCENARIOS);

    var found = jdbc.query("SELECT clearing_id,status FROM clearing_payment WHERE idempotency_key=?",
        (rs, n) -> Map.<String, Object>of("id", rs.getString(1), "status", rs.getString(2)), key);
    if (!found.isEmpty()) return Map.of("clearingId", found.get(0).get("id"), "status", found.get(0).get("status"));

    UUID id = UUID.randomUUID();
    String clearingRef = "CLR-" + id.toString().substring(0, 8).toUpperCase();

    if (scenario.equals("REJECT_ACCOUNT_INVALID")) {
      jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
          id, key, transferId, scenario, "REJECTED");
      return Map.of("clearingId", id.toString(), "clearingReference", clearingRef, "status", "REJECTED",
          "failureCode", "ACCOUNT_INVALID", "failureDetail", "Beneficiary account does not exist at target bank");
    }
    if (scenario.equals("REJECT_BANK_UNAVAILABLE")) {
      jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
          id, key, transferId, scenario, "REJECTED");
      return Map.of("clearingId", id.toString(), "clearingReference", clearingRef, "status", "REJECTED",
          "failureCode", "BANK_UNAVAILABLE", "failureDetail", "Target bank is not available");
    }

    jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
        id, key, transferId, scenario, "PENDING");
    return Map.of("clearingId", id.toString(), "clearingReference", clearingRef, "status", "ACCEPTED", "scenario", scenario);
  }

  @Transactional
  public Map<String, Object> deliver(UUID clearingId, int sequence) {
    var rows = jdbc.query("SELECT scenario,delivery_count,last_sequence FROM clearing_payment WHERE clearing_id=? FOR UPDATE",
        (rs, n) -> {
          var m = new java.util.HashMap<String, Object>();
          m.put("scenario", rs.getString(1));
          m.put("count", rs.getInt(2));
          m.put("last", (Integer) rs.getObject(3));
          return m;
        }, clearingId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Clearing payment not found");

    Map<String, Object> row = rows.get(0);
    String scenario = (String) row.get("scenario");
    int count = (Integer) row.get("count") + 1;
    int previous = row.get("last") == null ? 0 : (Integer) row.get("last");

    boolean duplicate = sequence <= previous;
    boolean outOfOrder = sequence > previous + 1;

    String status = determineStatus(scenario, count);

    if (!duplicate)
      jdbc.update("UPDATE clearing_payment SET delivery_count=?,last_sequence=?,status=? WHERE clearing_id=?",
          count, sequence, status, clearingId);

    String signature = sign(clearingId + ":" + sequence + ":" + status);
    return Map.of("clearingId", clearingId.toString(), "status", duplicate ? "DUPLICATE_IGNORED" : status,
        "signature", signature, "deliveryCount", count, "outOfOrder", outOfOrder, "scenario", scenario);
  }

  private String determineStatus(String scenario, int deliveryCount) {
    return switch (scenario) {
      case "SUCCESS_IMMEDIATE" -> "SETTLED";
      case "SUCCESS_DELAYED" -> deliveryCount >= 2 ? "SETTLED" : "PENDING";
      case "TIMEOUT_THEN_SUCCESS" -> deliveryCount >= 3 ? "SETTLED" : "TIMED_OUT";
      case "TIMEOUT_THEN_FAIL" -> "TIMED_OUT";
      case "RETURN_AFTER_SETTLEMENT" -> deliveryCount >= 2 ? "RETURNED" : "SETTLED";
      case "DUPLICATE_CALLBACK" -> "SETTLED";
      case "OUT_OF_ORDER_CALLBACK" -> "SETTLED";
      default -> "CALLBACK_RECEIVED";
    };
  }

  private String sign(String value) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
