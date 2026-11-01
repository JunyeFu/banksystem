package local.bank.channel.payments;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.FineractTransferPort.CoreTransferRejectedException;
import local.bank.channel.audit.AuditService;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import org.springframework.http.HttpStatus;
import local.bank.channel.payments.TransferReversalRepository.ReversalWork;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TransferReversalController {
  private final TransferReversalRepository repository;
  private final FineractTransferPort fineract;
  private final AuditService audit;
  private final TransferStateMachine stateMachine;
  private final TransactionOperations transactions;

  public TransferReversalController(TransferReversalRepository repository, FineractTransferPort fineract, AuditService audit,
                                    TransferStateMachine stateMachine, TransactionOperations transactions) {
    this.repository=repository;this.fineract=fineract;this.audit=audit;this.stateMachine=stateMachine;this.transactions=transactions;
  }

  @GetMapping("/api/operations/v1/approvals")
  public List<Map<String,Object>> approvals(@RequestParam(required=false) String status) {
    return repository.approvals(status);
  }

  @PostMapping("/api/operations/v1/transfers/{transferId}/reversal")
  @Transactional
  public Map<String,Object> request(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID transferId,@RequestBody Reason reason) {
    requireReason(reason);
    var rows=repository.lockTransferStatus(transferId);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found");
    if(Status.of(rows.get(0))!=Status.SETTLED)throw new ResponseStatusException(HttpStatus.CONFLICT,"Only settled transfers can be reversed");
    UUID id=UUID.randomUUID();
    repository.create(id,transferId,jwt.getSubject(),reason.reason());
    stateMachine.transitionState(transferId,Status.SETTLED,Status.REVERSAL_PENDING,"USER",jwt.getSubject(),reason.reason(),null);
    audit.record("TRANSFER_REVERSAL_REQUESTED","USER",jwt.getSubject(),"Transfer",transferId.toString(),"REVERSE","SUCCESS",null,Map.of("reason",reason.reason()));
    return actionResult(id,transferId,"PENDING",1,null);
  }

  @PostMapping("/api/operations/v1/transfers/reversals/{reversalId}/approve")
  public Map<String,Object> approve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reversalId,
      @RequestParam int version,@RequestBody Reason reason,@RequestHeader("Idempotency-Key") String key) {
    requireReason(reason);
    if(key==null||key.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Idempotency-Key is required");
    ReversalWork work=transactions.execute(tx->loadForApproval(reversalId,jwt.getSubject(),version,key));
    if(work==null)throw new IllegalStateException("Reversal preparation returned no result");
    if("CONFIRMED".equals(work.status()))return actionResult(reversalId,work.transferId(),"CONFIRMED",work.version(),work.coreReference());
    Long expected=parseReference(work.coreReference());boolean explicitRejection=false;String detail=null;
    if(work.submit())try{FineractTransferPort.Submission response=fineract.accountTransfer(work.destination(),work.source(),work.amount(),work.currency(),work.idempotencyKey());expected=response.coreId();}catch(CoreTransferRejectedException rejected){explicitRejection=true;detail=concise(rejected.getMessage());}catch(RuntimeException unknown){detail=concise(unknown.getMessage());}
    Optional<FineractTransferPort.VerifiedTransfer> core;
    try{core=fineract.findAccountTransfer(work.idempotencyKey(),expected,work.destination(),work.source(),work.amount());}catch(RuntimeException failure){return markUnknown(work,concise(failure.getMessage()));}
    if(core.isPresent())return confirm(work,core.get(),reason.reason());
    if(explicitRejection)return rejectFromCore(work,detail==null?"Core reversal rejected":detail);
    return markUnknown(work,detail==null?"Core reversal result is not visible":detail);
  }

  private ReversalWork loadForApproval(UUID reversalId,String checker,int version,String key) {
    var rows=repository.lockForApproval(reversalId);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Reversal not found");
    ReversalWork work=rows.get(0);
    if(work.maker().equals(checker))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker cannot check own reversal");
    if(work.checker()!=null&&!work.checker().equals(checker))throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal is already owned by another checker");
    if("CONFIRMED".equals(work.status()))return work;
    if(work.version()!=version)throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal version/state changed");
    if(!"PENDING".equals(work.status())&&!"CORE_RESULT_UNKNOWN".equals(work.status()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal is not awaiting a core result");
    if(work.submissionStarted()&&!key.equals(work.idempotencyKey()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal idempotency key changed");
    boolean submit=!work.submissionStarted();
    if(submit)repository.claim(reversalId,checker,key);
    return work.withSubmission(checker,key,submit);
  }

  private Map<String,Object> confirm(ReversalWork work,FineractTransferPort.VerifiedTransfer core,String reason) {
    Long ref=core.coreId();
    return transactions.execute(tx->{String status=lockStatus(work.reversalId());if("CONFIRMED".equals(status))return actionResult(work.reversalId(),work.transferId(),status,work.version()+1,String.valueOf(ref));requireCorePending(status);repository.confirm(work.reversalId(),String.valueOf(ref));stateMachine.transitionState(work.transferId(),Status.REVERSAL_PENDING,Status.REVERSED,"USER",work.checker(),reason,Map.of("coreReference",String.valueOf(ref)));audit.record("TRANSFER_REVERSED","USER",work.checker(),"Transfer",work.transferId().toString(),"REVERSE","SUCCESS",null,Map.of("coreReference",String.valueOf(ref)));return actionResult(work.reversalId(),work.transferId(),"CONFIRMED",work.version()+1,String.valueOf(ref));});
  }

  private Map<String,Object> markUnknown(ReversalWork work,String detail) {transactions.executeWithoutResult(tx->repository.markUnknown(work.reversalId(),detail));return actionResult(work.reversalId(),work.transferId(),"CORE_RESULT_UNKNOWN",work.version(),work.coreReference());}
  private Map<String,Object> rejectFromCore(ReversalWork work,String detail) {return transactions.execute(tx->{String status=lockStatus(work.reversalId());requireCorePending(status);repository.rejectFromCore(work.reversalId(),detail);stateMachine.transitionState(work.transferId(),Status.REVERSAL_PENDING,Status.SETTLED,"SYSTEM","reversal-processor","CORE_REJECTED",Map.of("reason",detail));return actionResult(work.reversalId(),work.transferId(),"REJECTED",work.version()+1,null);});}

  @PostMapping("/api/operations/v1/transfers/reversals/{reversalId}/reject")
  @Transactional
  public Map<String,Object> reject(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reversalId,@RequestParam int version,@RequestBody Reason reason,@RequestHeader("Idempotency-Key") String key) {
    requireReason(reason);var rows=repository.lockForRejection(reversalId);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Reversal not found");var row=rows.get(0);UUID transferId=(UUID)row.get("transfer");if("REJECTED".equals(row.get("status"))&&(Integer)row.get("version")==version+1)return actionResult(reversalId,transferId,"REJECTED",version+1,null);if(row.get("maker").equals(jwt.getSubject()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker cannot check own reversal");if(!"PENDING".equals(row.get("status"))||(Integer)row.get("version")!=version||(Boolean)row.get("submitted"))throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal version/state changed");repository.rejectByChecker(reversalId,jwt.getSubject());stateMachine.transitionState(transferId,Status.REVERSAL_PENDING,Status.SETTLED,"USER",jwt.getSubject(),reason.reason(),Map.of("approval","REJECTED"));audit.record("TRANSFER_REVERSAL_REJECTED","USER",jwt.getSubject(),"Transfer",transferId.toString(),"REVERSE","REJECTED",null,Map.of("reason",reason.reason(),"idempotencyKeyPresent",key!=null&&!key.isBlank()));return actionResult(reversalId,transferId,"REJECTED",version+1,null);
  }

  private String lockStatus(UUID id){var rows=repository.lockStatus(id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Reversal not found");return rows.get(0);}
  private static void requireCorePending(String status){if(!"PENDING".equals(status)&&!"CORE_RESULT_UNKNOWN".equals(status))throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal is not awaiting a core result");}
  private static void requireReason(Reason reason){if(reason==null||reason.reason()==null||reason.reason().isBlank()||reason.reason().length()>240)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason is required and must not exceed 240 characters");}
  private static Long parseReference(String value){if(value==null||value.isBlank())return null;try{return Long.parseLong(value);}catch(NumberFormatException ignored){return null;}}
  private static String concise(String value){String result=value==null||value.isBlank()?"Core reversal result unavailable":value;return result.substring(0,Math.min(240,result.length()));}
  private static Map<String,Object> actionResult(UUID reversalId,UUID transferId,String status,int version,String coreReference){Map<String,Object> result=new LinkedHashMap<>();result.put("reversalId",reversalId.toString());result.put("transferId",transferId.toString());result.put("status",status);result.put("version",version);result.put("coreReference",coreReference);return result;}
  public record Reason(String reason){}
}
