package local.bank.channel.payments;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import local.bank.channel.audit.AuditService;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.HexFormat;

import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import local.bank.channel.payments.TransferProcessor;

@Service
public class MockClearingService {
  private static final Logger log = LoggerFactory.getLogger(MockClearingService.class);
  private static final Set<String> V4_SCENARIOS = Set.of(
      "SUCCESS_IMMEDIATE", "SUCCESS_DELAYED", "REJECT_ACCOUNT_INVALID", "REJECT_BANK_UNAVAILABLE",
      "TIMEOUT_THEN_SUCCESS", "TIMEOUT_THEN_FAIL", "RETURN_AFTER_SETTLEMENT",
      "DUPLICATE_CALLBACK", "OUT_OF_ORDER_CALLBACK");

  private final JdbcTemplate jdbc;
  private final TransferProcessor transferProcessor;
  private final TransferStateMachine stateMachine;
  private final AuditService audit;
  private final String secret;

  public MockClearingService(JdbcTemplate jdbc, TransferProcessor transferProcessor,
                             TransferStateMachine stateMachine, AuditService audit,
                             @Value("${clearing.callback-secret}") String secret) {
    this.jdbc = jdbc;
    this.transferProcessor = transferProcessor;
    this.stateMachine = stateMachine;
    this.audit = audit;
    this.secret = secret;
  }

  @Transactional
  public Map<String, Object> submit(UUID transferId, String scenario, String key) {
    if (!V4_SCENARIOS.contains(scenario))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "Unsupported clearing scenario: " + scenario + ". Supported: " + V4_SCENARIOS);

    var found = jdbc.query("SELECT clearing_id,status FROM clearing_payment WHERE idempotency_key=?",
        (rs, n) -> Map.<String, Object>of("id", rs.getString(1), "status", rs.getString(2)), key);
    if (!found.isEmpty()) return Map.of("clearingId", found.get(0).get("id"), "status", found.get(0).get("status"));

    UUID id = UUID.randomUUID();
    String clearingRef = "CLR-" + id.toString().substring(0, 8).toUpperCase();
    String failureCode = null, failureDetail = null;

    if (scenario.equals("REJECT_ACCOUNT_INVALID")) {
      jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
          id, key, transferId, scenario, "REJECTED");
      failureCode = "ACCOUNT_INVALID";
      failureDetail = "Beneficiary account does not exist at target bank";
      propagateSubmitToTransfer(transferId, "REJECTED", failureCode, failureDetail);
      return Map.of("clearingId", id.toString(), "clearingReference", clearingRef, "status", "REJECTED",
          "failureCode", failureCode, "failureDetail", failureDetail);
    }
    if (scenario.equals("REJECT_BANK_UNAVAILABLE")) {
      jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
          id, key, transferId, scenario, "REJECTED");
      failureCode = "BANK_UNAVAILABLE";
      failureDetail = "Target bank is not available";
      propagateSubmitToTransfer(transferId, "REJECTED", failureCode, failureDetail);
      return Map.of("clearingId", id.toString(), "clearingReference", clearingRef, "status", "REJECTED",
          "failureCode", failureCode, "failureDetail", failureDetail);
    }

    jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)",
        id, key, transferId, scenario, "PENDING");
    propagateSubmitToTransfer(transferId, "ACCEPTED", null, null);
    return Map.of("clearingId", id.toString(), "clearingReference", clearingRef,
        "status", "ACCEPTED", "scenario", scenario);
  }

  private void propagateSubmitToTransfer(UUID transferId, String clearingStatus,
                                         String failureCode, String failureDetail) {
    String currentStatus = jdbc.queryForObject("SELECT status FROM transfer_order WHERE transfer_id=?",
        String.class, transferId);
    Status current = Status.of(currentStatus);

    if ("ACCEPTED".equals(clearingStatus)) {
      if (current == Status.CREATED) {
        stateMachine.transitionState(transferId, Status.CREATED, Status.VALIDATING,
            "SYSTEM", "mock-clearing");
        stateMachine.transitionState(transferId, Status.VALIDATING, Status.PENDING_APPROVAL,
            "SYSTEM", "mock-clearing");
        stateMachine.transitionState(transferId, Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING,
            "SYSTEM", "mock-clearing");
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "mock-clearing");
      } else if (current == Status.VALIDATING) {
        stateMachine.transitionState(transferId, Status.VALIDATING, Status.PENDING_APPROVAL,
            "SYSTEM", "mock-clearing");
        stateMachine.transitionState(transferId, Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING,
            "SYSTEM", "mock-clearing");
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "mock-clearing");
      } else if (current == Status.PENDING_CORE_POSTING) {
        stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
            "SYSTEM", "mock-clearing");
      }
      audit.record("TRANSFER_CLEARING_ACCEPTED", "SYSTEM", "mock-clearing", "Transfer",
          transferId.toString(), "CLEARING", "SUCCESS", null, Map.of("clearingStatus", "ACCEPTED"));
      return;
    }
    if ("REJECTED".equals(clearingStatus)) {
      moveToTerminal(transferId, current, Status.FAILED, failureCode, failureDetail);
    }
  }

  @Transactional
  public Map<String, Object> deliver(UUID clearingId, int sequence) {
    var rows = jdbc.query("SELECT scenario,delivery_count,last_sequence,transfer_id FROM clearing_payment WHERE clearing_id=? FOR UPDATE",
        (rs, n) -> {
          var m = new java.util.HashMap<String, Object>();
          m.put("scenario", rs.getString(1));
          m.put("count", rs.getInt(2));
          m.put("last", (Integer) rs.getObject(3));
          m.put("transferId", rs.getObject(4));
          return m;
        }, clearingId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Clearing payment not found");

    Map<String, Object> row = rows.get(0);
    String scenario = (String) row.get("scenario");
    UUID transferId = (UUID) row.get("transferId");
    int count = (Integer) row.get("count") + 1;
    int previous = row.get("last") == null ? 0 : (Integer) row.get("last");

    boolean duplicate = sequence <= previous;
    boolean outOfOrder = sequence > previous + 1;

    String status = determineStatus(scenario, count);

    if (!duplicate) {
      jdbc.update("UPDATE clearing_payment SET delivery_count=?,last_sequence=?,status=? WHERE clearing_id=?",
          count, sequence, status, clearingId);
      if (!outOfOrder)
        propagateDeliverToTransfer(transferId, status, scenario);
    }

    String signature = sign(clearingId + ":" + sequence + ":" + status);
    return Map.of("clearingId", clearingId.toString(),
        "status", duplicate ? "DUPLICATE_IGNORED" : status,
        "signature", signature, "deliveryCount", count,
        "outOfOrder", outOfOrder, "scenario", scenario);
  }

  private void propagateDeliverToTransfer(UUID transferId, String clearingStatus, String scenario) {
    String currentStatus;
    try {
      currentStatus = jdbc.queryForObject("SELECT status FROM transfer_order WHERE transfer_id=?",
          String.class, transferId);
    } catch (org.springframework.dao.EmptyResultDataAccessException e) {
      log.warn("Clearing deliver for unknown transfer {}", transferId);
      return;
    }
    Status current = Status.of(currentStatus);

    switch (clearingStatus) {
      case "SETTLED":
        if (current == Status.PENDING_CLEARING) {
          log.info("Clearing SETTLED for transfer {}; invoking core posting", transferId);
          transferProcessor.process(transferId);
        }
        break;
      case "RETURNED":
        if (current == Status.SETTLED) {
          stateMachine.transitionState(transferId, Status.SETTLED, Status.RETURNED,
              "SYSTEM", "mock-clearing", "CLEARING_RETURNED",
              Map.of("scenario", scenario));
          audit.record("TRANSFER_RETURNED", "SYSTEM", "mock-clearing", "Transfer",
              transferId.toString(), "RETURN", "SUCCESS", null, Map.of("scenario", scenario));
        }
        break;
      case "REJECTED", "FAILED":
        String failureCode = "REJECTED".equals(clearingStatus) ? "CLEARING_REJECTED" : "CLEARING_TIMEOUT_FAILED";
        String failureDetail = "REJECTED".equals(clearingStatus)
            ? "Clearing rejected payment" : "Clearing timed out then failed";
        moveToTerminal(transferId, current, Status.FAILED, failureCode, failureDetail);
        break;
      case "TIMED_OUT":
        log.info("Clearing TIMED_OUT for transfer {}; v4 terminal state, not propagating to transfer", transferId);
        break;
      default: /* PENDING etc. — do not propagate */ break;
    }
  }

  private void moveToTerminal(UUID transferId, Status current, Status finalStatus,
                              String failureCode, String failureDetail) {
    if (current == finalStatus) return;
    if (current == Status.SETTLED || current == Status.REVERSED
        || current == Status.RETURNED || current == Status.REVERSAL_PENDING)
      return;
    if (current != Status.PENDING_CLEARING && current != Status.TIMED_OUT
        && current != Status.CREATED && current != Status.VALIDATING
        && current != Status.PENDING_CORE_POSTING && current != Status.PENDING_APPROVAL
        && current != Status.RISK_REVIEW) {
      log.warn("Cannot transition transfer {} from {} to {}", transferId, current, finalStatus);
      return;
    }
    String reason = failureCode != null ? failureCode + ": " + failureDetail : failureDetail;
    if (reason != null && reason.length() > 240) reason = reason.substring(0, 240);
    jdbc.update("UPDATE transfer_order SET failure_reason=? WHERE transfer_id=?",
        reason, transferId);
    stateMachine.transitionState(transferId, current, finalStatus,
        "SYSTEM", "mock-clearing", failureCode, null);
    audit.record("TRANSFER_" + finalStatus.name(), "SYSTEM", "mock-clearing", "Transfer",
        transferId.toString(), "CLEARING", "FAILED", null,
        Map.of("failureCode", failureCode, "failureDetail", failureDetail == null ? "" : failureDetail));
  }

  private String determineStatus(String scenario, int deliveryCount) {
    return switch (scenario) {
      case "SUCCESS_IMMEDIATE" -> "SETTLED";
      case "SUCCESS_DELAYED" -> deliveryCount >= 2 ? "SETTLED" : "PENDING";
      case "TIMEOUT_THEN_SUCCESS" -> deliveryCount >= 3 ? "SETTLED" : "TIMED_OUT";
      case "TIMEOUT_THEN_FAIL" -> deliveryCount >= 3 ? "FAILED" : "TIMED_OUT";
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
