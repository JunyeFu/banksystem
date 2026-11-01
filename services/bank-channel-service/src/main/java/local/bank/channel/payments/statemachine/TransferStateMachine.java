package local.bank.channel.payments.statemachine;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * v4 §10 强制状态机守卫类。
 *
 * <p>12 态:
 * CREATED, VALIDATING, RISK_REVIEW, PENDING_APPROVAL, PENDING_CORE_POSTING, PENDING_CLEARING,
 * CORE_RESULT_UNKNOWN, SETTLED, FAILED, TIMED_OUT, RETURN_PENDING, RETURN_RESULT_UNKNOWN,
 * RETURNED, REVERSAL_PENDING, REVERSED
 *
 * <p>转换矩阵严格依据 v4 §10,任何非法 from->to 抛 409。
 */
@Component
public class TransferStateMachine {

  public enum Status {
    CREATED, VALIDATING, RISK_REVIEW, PENDING_APPROVAL, PENDING_CORE_POSTING, PENDING_CLEARING, CORE_RESULT_UNKNOWN,
    SETTLED, FAILED, TIMED_OUT, RETURN_PENDING, RETURN_RESULT_UNKNOWN, RETURNED, REVERSAL_PENDING, REVERSED;

    public static Status of(String raw) {
      if (raw == null) throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
          "Transfer status is null");
      try { return Status.valueOf(raw); }
      catch (IllegalArgumentException ex) {
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
            "Unknown transfer status: " + raw);
      }
    }
  }

  private static final Map<Status, Set<Status>> ALLOWED = new HashMap<>();
  static {
    ALLOWED.put(Status.CREATED, Set.of(Status.VALIDATING));
    ALLOWED.put(Status.VALIDATING, Set.of(Status.PENDING_APPROVAL, Status.RISK_REVIEW, Status.FAILED));
    ALLOWED.put(Status.RISK_REVIEW, Set.of(Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING, Status.FAILED));
    ALLOWED.put(Status.PENDING_APPROVAL, Set.of(Status.PENDING_CORE_POSTING, Status.FAILED));
    ALLOWED.put(Status.PENDING_CORE_POSTING, Set.of(Status.PENDING_CLEARING, Status.FAILED));
    ALLOWED.put(Status.PENDING_CLEARING, Set.of(Status.CORE_RESULT_UNKNOWN, Status.SETTLED, Status.FAILED));
    ALLOWED.put(Status.CORE_RESULT_UNKNOWN, Set.of(Status.SETTLED, Status.FAILED));
    ALLOWED.put(Status.SETTLED, Set.of(Status.REVERSAL_PENDING, Status.RETURN_PENDING));
    ALLOWED.put(Status.RETURN_PENDING, Set.of(Status.RETURN_RESULT_UNKNOWN, Status.RETURNED));
    ALLOWED.put(Status.RETURN_RESULT_UNKNOWN, Set.of(Status.RETURNED));
    ALLOWED.put(Status.REVERSAL_PENDING, Set.of(Status.REVERSED, Status.SETTLED));
    ALLOWED.put(Status.FAILED, Set.of());
    ALLOWED.put(Status.TIMED_OUT, Set.of());
    ALLOWED.put(Status.RETURNED, Set.of());
    ALLOWED.put(Status.REVERSED, Set.of());
  }

  private final TransferStateRepository repository;

  public TransferStateMachine(TransferStateRepository repository) { this.repository = repository; }

  public void checkTransition(Status from, Status to) {
    if (from == to)
      throw new ResponseStatusException(HttpStatus.CONFLICT,
          "State transition to same status: " + from);
    Set<Status> allowed = ALLOWED.getOrDefault(from, Set.of());
    if (!allowed.contains(to))
      throw new ResponseStatusException(HttpStatus.CONFLICT,
          "Illegal state transition: " + from + " -> " + to);
  }

  public void recordTransitionHistory(UUID transferId, Status from, Status to,
                                      String actorType, String actorId,
                                      String reasonCode, String metadataJson) {
    if (reasonCode != null && reasonCode.length() > 64)
      reasonCode = reasonCode.substring(0, 64);
    if (metadataJson == null) metadataJson = "{}";
    repository.history(transferId, from == null ? null : from.name(), to.name(),
        actorType, actorId, reasonCode, metadataJson);
  }

  public void transitionState(UUID transferId, Status from, Status to,
                              String actorType, String actorId,
                              String reasonCode, Map<String, Object> auditMetadata) {
    checkTransition(from, to);
    String reason = reasonCode != null && reasonCode.length() > 64
        ? reasonCode.substring(0, 64) : reasonCode;
    String metadataJson = auditMetadata == null ? "{}"
        : serializeMetadata(auditMetadata);

    int updated = repository.changeStatus(transferId, from == null ? null : from.name(), to.name());
    if (updated == 0)
      throw new ResponseStatusException(HttpStatus.CONFLICT,
          "Concurrent state change detected for transfer " + transferId
              + " (expected " + from + " -> " + to + ")");

    repository.history(transferId, from == null ? null : from.name(), to.name(),
        actorType, actorId, reason, metadataJson);

    String payload = "{\"transferId\":\"" + transferId + "\",\"status\":\"" + to.name() + "\""
        + (reason != null ? ",\"reason\":\"" + sanitize(reason) + "\"" : "") + "}";
    repository.outbox(transferId, "transfer.status.changed", payload);
  }

  public void transitionState(UUID transferId, Status from, Status to,
                              String actorType, String actorId) {
    transitionState(transferId, from, to, actorType, actorId, null, null);
  }

  public Set<Status> allowedNext(Status from) {
    return ALLOWED.getOrDefault(from, Set.of());
  }

  public Map<Status, Set<Status>> matrix() { return Map.copyOf(ALLOWED); }

  private static String serializeMetadata(Map<String, Object> map) {
    if (map == null || map.isEmpty()) return "{}";
    StringBuilder sb = new StringBuilder("{");
    boolean first = true;
    for (var e : map.entrySet()) {
      if (!first) sb.append(',');
      sb.append('"').append(sanitize(e.getKey())).append("\":")
          .append('"').append(sanitize(String.valueOf(e.getValue()))).append('"');
      first = false;
    }
    return sb.append('}').toString();
  }

  private static String sanitize(String s) {
    if (s == null) return "";
    return s.replace("\\", "\\\\").replace("\"", "\\\"").replace('\n', ' ');
  }
}
