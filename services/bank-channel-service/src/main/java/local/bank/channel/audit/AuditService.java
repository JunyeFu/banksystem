package local.bank.channel.audit;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AuditService {
  public static final String EVENT_CASE_CREATED = "CASE_CREATED";
  public static final String EVENT_CASE_EXPORTED = "CASE_EXPORTED";
  public static final String EVENT_VIDEO_UPLOADED = "VIDEO_UPLOADED";
  public static final String EVENT_BASELINE_CREATED = "BASELINE_CREATED";
  public static final String EVENT_BASELINE_APPROVED = "BASELINE_APPROVED";
  public static final String EVENT_FIXTURE_SEEDED = "FIXTURE_SEEDED";
  public static final String EVENT_FIXTURE_RESET = "FIXTURE_RESET";
  public static final String EVENT_EVIDENCE_ACCESSED = "EVIDENCE_ACCESSED";

  private final AuditRepository repository;
  private final AuditRecordHasher hasher;
  private final TransactionTemplate transactions;

  public AuditService(AuditRepository repository, AuditRecordHasher hasher,
                      PlatformTransactionManager transactionManager) {
    this.repository = repository;
    this.hasher = hasher;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  public void record(String eventType, String actorType, String actorId, String resourceType,
      String resourceId, String action, String outcome, Map<String, Object> before, Map<String, Object> after) {
    String beforeJson = hasher.json(before);
    String afterJson = hasher.json(after);
    transactions.executeWithoutResult(status -> {
      repository.lockChain();
      AuditRepository.Tail tail = repository.tail();
      String previousHash = tail == null ? null : tail.recordHash();
      UUID id = UUID.randomUUID();
      OffsetDateTime createdAt = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
      if (tail != null && !createdAt.isAfter(tail.createdAt())) {
        createdAt = tail.createdAt().plus(1, ChronoUnit.MICROS);
      }
      var record = new AuditRecordHasher.AuditRecord(AuditRecordHasher.CURRENT_VERSION, id,
          eventType, actorType, actorId, "default", resourceType, resourceId, action, outcome,
          MDC.get("requestId"), MDC.get("correlationId"), beforeJson, afterJson, previousHash,
          createdAt, null);
      String recordHash = hasher.hash(record);
      repository.append(record, recordHash);
    });
  }

}
