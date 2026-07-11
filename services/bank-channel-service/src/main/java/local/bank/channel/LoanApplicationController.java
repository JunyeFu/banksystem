package local.bank.channel;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class LoanApplicationController {
  private final JdbcTemplate jdbc;
  public LoanApplicationController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @PostMapping("/api/customer/v1/loans/applications")
  public Map<String,Object> draft(@AuthenticationPrincipal Jwt jwt,@RequestBody Request request){
    if(request.amount()==null||request.amount().signum()<=0||request.termMonths()<1||request.termMonths()>480||request.purpose()==null||request.purpose().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid loan application");
    UUID id=UUID.randomUUID();jdbc.update("INSERT INTO loan_application(application_id,subject,requested_amount,term_months,purpose,status) VALUES(?,?,?,?,?,?)",id,jwt.getSubject(),request.amount(),request.termMonths(),request.purpose(),"DRAFT");return Map.of("applicationId",id.toString(),"status","DRAFT","version",1);
  }
  @PostMapping("/api/customer/v1/loans/applications/{id}/submit")
  public Map<String,Object> submit(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){int n=jdbc.update("UPDATE loan_application SET status='SUBMITTED',version=version+1 WHERE application_id=? AND subject=? AND status='DRAFT'",id,jwt.getSubject());if(n==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Application is not an editable draft");return Map.of("applicationId",id.toString(),"status","SUBMITTED");}
  public record Request(BigDecimal amount,int termMonths,String purpose){}
}
