package local.bank.channel.customerprofile;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class LoanApprovalController {
  private final JdbcTemplate jdbc;
  public LoanApprovalController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @PostMapping("/api/operations/v1/loans/applications/{id}/approval")
  public Map<String,Object> request(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Reason reason){
    if(reason.reason()==null||reason.reason().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason is required");var a=jdbc.query("SELECT status FROM loan_application WHERE application_id=?",(rs,n)->rs.getString(1),id);if(a.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Application not found");UUID approval=UUID.randomUUID();jdbc.update("INSERT INTO loan_approval(approval_id,application_id,maker_subject,status,reason) VALUES(?,?,?,?,?)",approval,id,jwt.getSubject(),"PENDING",reason.reason());return Map.of("approvalId",approval.toString(),"status","PENDING","version",1);
  }
  @PostMapping("/api/operations/v1/loans/approvals/{id}/approve")
  public Map<String,Object> approve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam int version,@RequestBody Reason reason){var rows=jdbc.query("SELECT maker_subject,status,version FROM loan_approval WHERE approval_id=? FOR UPDATE",(rs,n)->Map.<String,Object>of("maker",rs.getString(1),"status",rs.getString(2),"version",rs.getInt(3)),id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Approval not found");var row=rows.get(0);if(row.get("maker").equals(jwt.getSubject()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker cannot check own loan");if(!"PENDING".equals(row.get("status"))||(Integer)row.get("version")!=version)throw new ResponseStatusException(HttpStatus.CONFLICT,"Approval version/state changed");if(reason.reason()==null||reason.reason().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason is required");jdbc.update("UPDATE loan_approval SET checker_subject=?,status='APPROVED',reason=?,version=version+1 WHERE approval_id=?",jwt.getSubject(),reason.reason(),id);return Map.of("approvalId",id.toString(),"status","APPROVED","version",version+1);}
  public record Reason(String reason){}
}
