package local.bank.channel.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class AuditRecordHasher {
  static final int CURRENT_VERSION = 2;

  private final ObjectMapper mapper;

  public AuditRecordHasher(ObjectMapper mapper) {
    this.mapper = mapper.copy().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
  }

  String json(Map<String, Object> value) {
    if (value == null) return null;
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("Audit metadata is not JSON serializable", e);
    }
  }

  String canonicalJson(String value) {
    if (value == null) return null;
    try {
      return mapper.writeValueAsString(mapper.readValue(value, Object.class));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Stored audit metadata is invalid JSON", e);
    }
  }

  String hash(AuditRecord record) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("hashVersion", record.hashVersion());
    fields.put("id", record.id().toString());
    fields.put("eventType", record.eventType());
    fields.put("actorType", record.actorType());
    fields.put("actorId", record.actorId());
    fields.put("tenantId", record.tenantId());
    fields.put("resourceType", record.resourceType());
    fields.put("resourceId", record.resourceId());
    fields.put("action", record.action());
    fields.put("outcome", record.outcome());
    fields.put("requestId", record.requestId());
    fields.put("correlationId", record.correlationId());
    fields.put("beforeJson", canonicalJson(record.beforeJson()));
    fields.put("afterJson", canonicalJson(record.afterJson()));
    fields.put("previousHash", record.previousHash());
    fields.put("createdAt", record.createdAt().toInstant().toString());
    try {
      return sha256(mapper.writeValueAsString(fields));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Audit record hashing failed", e);
    }
  }

  static String legacyHash(AuditRecord record) {
    return sha256(record.previousHash() + "|" + record.eventType() + "|" + record.actorId() + "|"
        + record.resourceId() + "|" + record.action() + "|" + record.outcome());
  }

  private static String sha256(String input) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256")
          .digest(input.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  record AuditRecord(int hashVersion, UUID id, String eventType, String actorType, String actorId,
                     String tenantId, String resourceType, String resourceId, String action,
                     String outcome, String requestId, String correlationId, String beforeJson,
                     String afterJson, String previousHash, OffsetDateTime createdAt,
                     String recordHash) {}
}
