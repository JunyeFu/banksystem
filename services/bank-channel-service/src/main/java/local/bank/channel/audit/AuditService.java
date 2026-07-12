package local.bank.channel.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
  private final JdbcTemplate jdbc;

  public AuditService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void record(String eventType, String actorType, String actorId, String resourceType,
      String resourceId, String action, String outcome, Map<String, Object> before, Map<String, Object> after) {
    String requestId = MDC.get("requestId");
    String correlationId = MDC.get("correlationId");
    String previousHash = getLastHash();
    String beforeJson = before == null ? null : toJson(before);
    String afterJson = after == null ? null : toJson(after);
    String recordInput = previousHash + "|" + eventType + "|" + actorId + "|" + resourceId + "|" + action + "|" + outcome;
    String recordHash = sha256(recordInput);
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO security_audit_event(id,event_type,actor_type,actor_id,tenant_id,resource_type,resource_id,action,outcome,request_id,correlation_id,before_json,after_json,previous_hash,record_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,?)",
        id, eventType, actorType, actorId, "default", resourceType, resourceId, action, outcome,
        requestId, correlationId, beforeJson, afterJson, previousHash, recordHash);
  }

  private String getLastHash() {
    try {
      return jdbc.queryForObject("SELECT record_hash FROM security_audit_event ORDER BY created_at DESC LIMIT 1", String.class);
    } catch (Exception e) {
      return null;
    }
  }

  private static String toJson(Map<String, Object> map) {
    try {
      return com.fasterxml.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(map);
    } catch (Exception e) {
      return "{}";
    }
  }

  private static String sha256(String input) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
