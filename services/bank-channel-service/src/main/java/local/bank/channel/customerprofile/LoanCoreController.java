package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractAdapter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

@RestController
public class LoanCoreController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  private final long productId;
  private final String currency;

  public LoanCoreController(JdbcTemplate jdbc, FineractAdapter fineract,
      @Value("${fineract.loan-product-id:1}") long productId,
      @Value("${fineract.loan-currency:USD}") String currency) {
    this.jdbc = jdbc; this.fineract = fineract; this.productId = productId; this.currency = currency;
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/core-submit")
  public Map<String,Object> coreSubmit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key) {
    var rows = jdbc.query("SELECT requested_amount,term_months,purpose,core_loan_id FROM loan_application WHERE application_id=? AND subject=? AND status IN ('SUBMITTED','APPROVED')", (rs,n)->{var m=new HashMap<String,Object>();m.put("amount",rs.getBigDecimal(1));m.put("term",rs.getInt(2));m.put("purpose",rs.getString(3));m.put("core",rs.getObject(4));return m;}, id, jwt.getSubject());
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Submitted application not found");
    var existing = rows.get(0).get("core");
    if(existing != null) return Map.of("applicationId",id.toString(),"coreLoanId",((Number)existing).longValue(),"status","SUBMITTED");
    long clientId = jdbc.queryForObject("SELECT fineract_client_id FROM customer_identity WHERE subject=?", Long.class, jwt.getSubject());
    BigDecimal amount=(BigDecimal)rows.get(0).get("amount"); int term=(Integer)rows.get(0).get("term");
    Map<String,Object> body=new HashMap<>(); body.put("clientId",clientId); body.put("productId",productId); body.put("principal",amount); body.put("loanTermFrequency",term); body.put("loanTermFrequencyType",2); body.put("loanType","individual"); body.put("numberOfRepayments",term); body.put("repaymentEvery",1); body.put("repaymentFrequencyType",2); body.put("interestRatePerPeriod",1.5); body.put("interestRateFrequencyType",2); body.put("amortizationType",1); body.put("interestType",0); body.put("interestCalculationPeriodType",1); body.put("transactionProcessingStrategyCode","mifos-standard-strategy"); body.put("expectedDisbursementDate",LocalDate.now().toString()); body.put("submittedOnDate",LocalDate.now().toString()); body.put("dateFormat","yyyy-MM-dd"); body.put("locale","en");
    Map<String,Object> core=fineract.submitLoan(body,key); Object idValue=core.get("loanId"); if(idValue==null) idValue=core.get("resourceId");
    if(!(idValue instanceof Number)) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Fineract did not return loan id");
    jdbc.update("UPDATE loan_application SET core_loan_id=?,core_idempotency_key=?,status='SUBMITTED',version=version+1 WHERE application_id=? AND core_loan_id IS NULL",((Number)idValue).longValue(),key,id);
    return Map.of("applicationId",id.toString(),"coreLoanId",((Number)idValue).longValue(),"status","SUBMITTED");
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/core/{command}")
  public Map<String,Object> command(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable String command,
      @RequestHeader("Idempotency-Key") String key,@RequestBody(required=false) Map<String,Object> body) {
    Long loanId=coreLoanFor(jwt.getSubject(), id);
    Map<String,Object> payload=body==null?new HashMap<>():new HashMap<>(body); String today=LocalDate.now().toString();
    if(command.equals("approve")){payload.putIfAbsent("approvedOnDate",today);payload.putIfAbsent("approvedLoanAmount",payload.getOrDefault("approvedLoanAmount",payload.getOrDefault("amount",null)));payload.putIfAbsent("dateFormat","yyyy-MM-dd");payload.putIfAbsent("locale","en");}
    if(command.equals("disburse")){payload.putIfAbsent("actualDisbursementDate",today);payload.putIfAbsent("dateFormat","yyyy-MM-dd");payload.putIfAbsent("locale","en");}
    Map<String,Object> result=fineract.loanCommand(loanId,command,payload,key);
    jdbc.update("UPDATE loan_application SET status=?,version=version+1 WHERE application_id=?",command.equals("disburse")?"DISBURSED":command.toUpperCase(),id);
    return Map.of("applicationId",id.toString(),"coreLoanId",loanId,"command",command,"core",result);
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/repayment")
  public Map<String,Object> repayment(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key,@RequestBody Map<String,Object> body){
    Long loanId=coreLoanFor(jwt.getSubject(), id);
    Map<String,Object> payload=new HashMap<>(body); payload.putIfAbsent("transactionDate",LocalDate.now().toString()); payload.putIfAbsent("dateFormat","yyyy-MM-dd"); payload.putIfAbsent("locale","en");
    return Map.of("applicationId",id.toString(),"coreLoanId",loanId,"core",fineract.loanTransaction(loanId,"repayment",payload,key));
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/close")
  public Map<String,Object> close(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") String key){
    Long loanId=coreLoanFor(jwt.getSubject(), id);
    Map<String,Object> current=fineract.loanDetails(loanId);
    Object statusObject=current.get("status"); String currentStatus=""; if(statusObject instanceof Map<?,?> raw){Object value=raw.get("value");currentStatus=value==null?"":String.valueOf(value);}
    if(currentStatus.toLowerCase().startsWith("closed") || currentStatus.equalsIgnoreCase("Fully Paid") || currentStatus.equalsIgnoreCase("Overpaid")){
      jdbc.update("UPDATE loan_application SET status='CLOSED',version=version+1 WHERE application_id=?",id);
      return Map.of("applicationId",id.toString(),"coreLoanId",loanId,"status","CLOSED","core",current);
    }
    Map<String,Object> payload=new HashMap<>(); payload.put("transactionDate",LocalDate.now().toString()); payload.put("dateFormat","yyyy-MM-dd"); payload.put("locale","en");
    Map<String,Object> result;
    try { result=fineract.loanTransaction(loanId,"close",payload,key); }
    catch (HttpClientErrorException ex) {
      throw new ResponseStatusException(HttpStatus.CONFLICT,"Core loan cannot close before obligations are met");
    }
    jdbc.update("UPDATE loan_application SET status='CLOSED',version=version+1 WHERE application_id=?",id);
    return Map.of("applicationId",id.toString(),"coreLoanId",loanId,"status","CLOSED","core",result);
  }

  private Long coreLoanFor(String subject, UUID id) {
    var rows=jdbc.query("SELECT core_loan_id FROM loan_application WHERE application_id=? AND subject=?",(rs,n)->(Long)rs.getObject(1),id,subject);
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Loan application not found");
    if(rows.get(0)==null) throw new ResponseStatusException(HttpStatus.CONFLICT,"Core loan has not been submitted");
    return rows.get(0);
  }
}
