package local.bank.channel.customerprofile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractLoanPort;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.audit.AuditService;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LoanOperationService {
  private final LoanRepository loans;
  private final LoanOperationRepository repository;
  private final FineractLoanPort core;
  private final FineractOperationsPort operations;
  private final AuditService audit;
  private final ObjectMapper json;
  private final TransactionTemplate tx;
  private final local.bank.channel.CoreWriteRepository writes;
  public LoanOperationService(LoanRepository loans,LoanOperationRepository repository,FineractLoanPort core,
      FineractOperationsPort operations,AuditService audit,ObjectMapper json,PlatformTransactionManager manager,
      local.bank.channel.CoreWriteRepository writes) {
    this.loans=loans;this.repository=repository;this.core=core;this.operations=operations;
    this.audit=audit;this.json=json;this.tx=new TransactionTemplate(manager);
    this.writes=writes;
  }
  public Map<String,Object> execute(String subject,UUID application,String key,String command,BigDecimal amount) {
    if(key==null||key.isBlank()||key.length()>128)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid Idempotency-Key");
    try(var lease=writes.acquire()) {
      return executeUnderLease(subject,application,key,command,amount);
    }
  }
  private Map<String,Object> executeUnderLease(String subject,UUID application,String key,String command,BigDecimal amount) {
    long loanId=loans.coreLoanFor(subject,application);
    var date=operations.postingDate();
    String correlation=MDC.get("correlationId");
    if(correlation==null)correlation=UUID.randomUUID().toString();
    String requestCorrelation=correlation;
    boolean claimed=Boolean.TRUE.equals(tx.execute(s->repository.claim(UUID.randomUUID(),application,key,command,amount,date,requestCorrelation)));
    var operation=repository.find(application,key);
    if(!operation.command().equals(command)||!sameAmount(operation.amount(),amount))throw conflict("Idempotency key is bound to different loan operation");
    if(operation.status().equals("COMPLETED"))return read(operation.response());
    if(operation.status().equals("REJECTED"))throw conflict("Core rejected this loan operation");
    String coreKey=operation.id().toString();
    var verified=command.equals("close")?core.findTransaction(loanId,command,amount,operation.date(),coreKey)
        : java.util.Optional.<FineractLoanPort.LoanActionResult>empty();
    if(claimed && verified.isEmpty()) {
      try { core.loanTransaction(loanId,command,amount,operation.date(),coreKey); }
      catch(RestClientResponseException error) {
        if(error.getStatusCode().is4xxClientError()) {
          tx.executeWithoutResult(s->repository.reject(operation.id()));
          throw conflict("Core rejected this loan operation with HTTP "+error.getStatusCode().value());
        }
        tx.executeWithoutResult(s->repository.unknown(operation.id()));
      } catch(ResourceAccessException error) {
        tx.executeWithoutResult(s->repository.unknown(operation.id()));
      }
    }
    if(verified.isEmpty())verified=core.findTransaction(loanId,command,amount,operation.date(),coreKey);
    if(verified.isEmpty()) {
      tx.executeWithoutResult(s->repository.unknown(operation.id()));
      throw conflict("Core loan operation outcome unknown; only readback is permitted");
    }
    var result=new LinkedHashMap<String,Object>();
    result.put("applicationId",application.toString());result.put("coreLoanId",loanId);
    result.put("core",verified.get().corePayload());
    if(command.equals("close"))result.put("status","CLOSED");
    tx.executeWithoutResult(s->{
      if(repository.complete(operation.id(),write(result))) {
        if(command.equals("close"))loans.closeApplication(application);
        var event=Map.<String,Object>of("applicationId",application.toString(),"operationId",operation.id().toString(),
            "coreLoanId",loanId,"command",command,"status","COMPLETED","correlationId",operation.correlation());
        repository.outbox(operation.id(),application,write(event));
        audit.record("LOAN_OPERATION_COMPLETED","CUSTOMER",subject,"LoanApplication",application.toString(),command,"SUCCESS",null,event);
      }
    });
    return read(repository.find(application,key).response());
  }
  private static boolean sameAmount(BigDecimal a,BigDecimal b){return a==null?b==null:b!=null&&a.compareTo(b)==0;}
  private static ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
  private String write(Object value) {
    try{return json.writeValueAsString(value);}catch(JsonProcessingException e){throw new IllegalStateException(e);}
  }
  private Map<String,Object> read(String value) {
    try{return json.readValue(value,new TypeReference<Map<String,Object>>(){});}catch(JsonProcessingException e){throw new IllegalStateException(e);}
  }
}
