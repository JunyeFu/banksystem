package local.bank.channel.payments;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.FineractTransferPort.CoreTransferRejectedException;
import local.bank.channel.audit.AuditService;
import local.bank.channel.notifications.NotificationRepository;
import local.bank.channel.payments.TransferProcessingRepository.TransferWork;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import local.bank.channel.risk.RiskService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.web.server.ResponseStatusException;

/** Coordinates a core transfer without holding a database transaction across the network call. */
@Service
public class TransferProcessor {
  private final TransferProcessingRepository repository;
  private final TransferReceiptRepository receipts;
  private final NotificationRepository notifications;
  private final FineractTransferPort fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;
  private final TransactionOperations transactions;
  private final RiskService risk;

  public TransferProcessor(TransferProcessingRepository repository, TransferReceiptRepository receipts,
                           NotificationRepository notifications, FineractTransferPort fineract, AuditService audit,
                           TransferStateMachine stateMachine, TransactionOperations transactions,
                           RiskService risk) {
    this.repository = repository;
    this.receipts = receipts;
    this.notifications = notifications;
    this.fineract = fineract;
    this.audit = audit;
    this.stateMachine = stateMachine;
    this.transactions = transactions;
    this.risk = risk;
  }

  public Map<String, Object> process(UUID transferId) {
    TransferWork work = transactions.execute(status -> prepare(transferId));
    if (work == null) throw new IllegalStateException("Transfer preparation returned no result");
    if (work.status() != Status.PENDING_CORE_POSTING && work.status() != Status.PENDING_CLEARING
        && work.status() != Status.CORE_RESULT_UNKNOWN) {
      return result(work.transferId(), work.status(), work.coreReference(), work.correlation(), null);
    }

    if (work.status() == Status.PENDING_CORE_POSTING) {
      UUID preparedTransferId = work.transferId();
      Boolean claimed = transactions.execute(status -> claimCoreSubmission(preparedTransferId));
      if (!Boolean.TRUE.equals(claimed)) {
        work = transactions.execute(status -> load(preparedTransferId, true));
        if (work == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
        return resolveFromCore(work, parsedReference(work.coreReference()), false, "Core submission already claimed");
      }
      work = work.withStatus(Status.PENDING_CLEARING);
      FineractTransferPort.Submission submitted;
      try {
        submitted = fineract.accountTransfer(
            work.sourceAccountId(), work.destinationAccountId(), work.amount(), work.currency(), work.idempotencyKey());
      } catch (CoreTransferRejectedException rejected) {
        return resolveFromCore(work, null, true, concise(rejected.getMessage()));
      } catch (RuntimeException unknown) {
        return resolveFromCore(work, null, false, concise(unknown.getMessage()));
      }
      Long reference = submitted.coreId();
      return resolveFromCore(work, reference, false,
          reference == null ? "Core response did not include a transfer id" : null);
    }

    return resolveFromCore(work, parsedReference(work.coreReference()), false, "Core result requires readback");
  }

  private TransferWork prepare(UUID transferId) {
    TransferWork work = load(transferId, true);
    if (work == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    Status current = work.status();
    switch (current) {
      case CREATED -> {
        stateMachine.transitionState(transferId, Status.CREATED, Status.VALIDATING, "SYSTEM", "transfer-processor");
        return applyRisk(work, Status.VALIDATING);
      }
      case VALIDATING -> {
        return applyRisk(work, Status.VALIDATING);
      }
      case PENDING_APPROVAL -> {
        stateMachine.transitionState(transferId, Status.PENDING_APPROVAL, Status.PENDING_CORE_POSTING, "SYSTEM", "transfer-processor");
        return work.withStatus(Status.PENDING_CORE_POSTING);
      }
      default -> { return work; }
    }
  }

  private TransferWork applyRisk(TransferWork work, Status from) {
    Map<String,Object> decision=risk.evaluate(work.transferId(),work.amount(),work.subject());
    String value=String.valueOf(decision.get("decision"));
    if ("BLOCK".equals(value)) {
      stateMachine.transitionState(work.transferId(),from,Status.FAILED,"SYSTEM","risk-service","RISK_BLOCKED",decision);
      return work.withStatus(Status.FAILED);
    }
    if ("REVIEW".equals(value)) {
      stateMachine.transitionState(work.transferId(),from,Status.RISK_REVIEW,"SYSTEM","risk-service","RISK_REVIEW",decision);
      return work.withStatus(Status.RISK_REVIEW);
    }
    stateMachine.transitionState(work.transferId(),from,Status.PENDING_APPROVAL,"SYSTEM","risk-service","RISK_ALLOWED",decision);
    stateMachine.transitionState(work.transferId(),Status.PENDING_APPROVAL,Status.PENDING_CORE_POSTING,"SYSTEM","transfer-processor");
    return work.withStatus(Status.PENDING_CORE_POSTING);
  }

  private boolean claimCoreSubmission(UUID transferId) {
    if (!repository.claimCoreSubmission(transferId)) return false;
    stateMachine.transitionState(transferId, Status.PENDING_CORE_POSTING, Status.PENDING_CLEARING,
        "SYSTEM", "transfer-processor");
    return true;
  }

  private Map<String, Object> resolveFromCore(TransferWork work, Long expectedCoreId,
                                               boolean explicitRejection, String detail) {
    Optional<FineractTransferPort.VerifiedTransfer> core;
    try {
      core = fineract.findAccountTransfer(work.idempotencyKey(), expectedCoreId,
          work.sourceAccountId(), work.destinationAccountId(), work.amount());
    } catch (RuntimeException readbackFailure) {
      return markUnknown(work.transferId(), concise(readbackFailure.getMessage()));
    }
    if (core.isPresent()) return settle(work, core.get());
    if (explicitRejection) return fail(work.transferId(), detail == null ? "Core transfer rejected" : detail);
    return markUnknown(work.transferId(), detail == null ? "Core transfer result is not visible" : detail);
  }

  private Map<String, Object> settle(TransferWork work, FineractTransferPort.VerifiedTransfer core) {
    Long coreId = core.coreId();
    return transactions.execute(status -> {
      Status current = lockStatus(work.transferId());
      if (current == Status.SETTLED) return result(work.transferId(), current, String.valueOf(coreId), work.correlation(), null);
      requireConverging(current);
      repository.verified(work.transferId(),coreId);
      stateMachine.transitionState(work.transferId(), current, Status.SETTLED, "SYSTEM", "transfer-processor");

      repository.projection(work.transferId(),work.sourceAccountId(),work.amount(),BigDecimal.ZERO,work.correlation());
      repository.projection(work.transferId(),work.destinationAccountId(),BigDecimal.ZERO,work.amount(),work.correlation());

      String receiptPayload = "{\"transferId\":\"" + work.transferId() + "\",\"amount\":\"" + work.amount()
          + "\",\"currency\":\"" + work.currency() + "\",\"status\":\"SETTLED\",\"coreReference\":\""
          + coreId + "\",\"correlationId\":\"" + work.correlation() + "\"}";
      if (work.subject() != null) {
        receipts.insert(work.transferId(),work.subject(),receiptPayload,sha256(receiptPayload));
        notifications.transferSettled(work.subject(),receiptPayload);
      }
      audit.record("TRANSFER_SETTLED", "SYSTEM", "transfer-processor", "Transfer",
          work.transferId().toString(), "PROCESS", "SUCCESS", null, Map.of("coreReference", String.valueOf(coreId)));
      return result(work.transferId(), Status.SETTLED, String.valueOf(coreId), work.correlation(), null);
    });
  }

  private Map<String, Object> fail(UUID transferId, String reason) {
    return transactions.execute(status -> {
      Status current = lockStatus(transferId);
      if (current == Status.FAILED) return result(transferId, current, null, null, reason);
      requireConverging(current);
      repository.rejected(transferId,reason);
      stateMachine.transitionState(transferId, current, Status.FAILED, "SYSTEM", "transfer-processor",
          "CORE_REJECTED", Map.of("reason", reason));
      audit.record("TRANSFER_FAILED", "SYSTEM", "transfer-processor", "Transfer",
          transferId.toString(), "PROCESS", "FAILED", null, Map.of("reason", reason));
      return result(transferId, Status.FAILED, null, null, reason);
    });
  }

  private Map<String, Object> markUnknown(UUID transferId, String reason) {
    return transactions.execute(status -> {
      Status current = lockStatus(transferId);
      if (current == Status.SETTLED || current == Status.FAILED) return result(transferId, current, null, null, null);
      if (current == Status.PENDING_CLEARING) {
        stateMachine.transitionState(transferId, current, Status.CORE_RESULT_UNKNOWN,
            "SYSTEM", "transfer-processor", "CORE_RESULT_UNKNOWN", Map.of("reason", reason));
      } else if (current != Status.CORE_RESULT_UNKNOWN) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Transfer is not awaiting a core result");
      }
      repository.unknown(transferId,reason);
      audit.record("TRANSFER_CORE_RESULT_UNKNOWN", "SYSTEM", "transfer-processor", "Transfer",
          transferId.toString(), "PROCESS", "UNKNOWN", null, Map.of("reason", reason));
      return result(transferId, Status.CORE_RESULT_UNKNOWN, null, null, reason);
    });
  }

  private TransferWork load(UUID transferId, boolean lock) {
    return repository.load(transferId,lock);
  }

  private Status lockStatus(UUID transferId) {
    TransferWork work = load(transferId, true);
    if (work == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    return work.status();
  }

  private static void requireConverging(Status status) {
    if (status != Status.PENDING_CLEARING && status != Status.CORE_RESULT_UNKNOWN) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Transfer is not awaiting a core result");
    }
  }

  private static Long parsedReference(String value) {
    if (value == null || value.isBlank()) return null;
    try { return Long.parseLong(value); }
    catch (NumberFormatException ignored) { return null; }
  }

  private static String concise(String value) {
    String reason = value == null || value.isBlank() ? "Core transfer result unavailable" : value;
    return reason.substring(0, Math.min(240, reason.length()));
  }

  private static Map<String, Object> result(UUID transferId, Status status, String coreReference,
                                             String correlationId, String failureReason) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("transferId", transferId.toString());
    result.put("status", status.name());
    if (coreReference != null) result.put("coreReference", coreReference);
    if (correlationId != null) result.put("correlationId", correlationId);
    if (failureReason != null) result.put("failureReason", failureReason);
    return result;
  }

  private static String sha256(String input) {
    try {
      var digest = java.security.MessageDigest.getInstance("SHA-256")
          .digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(digest);
    } catch (java.security.GeneralSecurityException exception) {
      throw new IllegalStateException(exception);
    }
  }

}
