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
public class LoanScoringController {
  private final JdbcTemplate jdbc;
  public LoanScoringController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @PostMapping("/api/operations/v1/loans/applications/{id}/score")
  public Map<String,Object> score(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){
    var rows=jdbc.query("SELECT requested_amount,term_months,status FROM loan_application WHERE application_id=?",(rs,n)->Map.<String,Object>of("amount",rs.getBigDecimal(1),"term",rs.getInt(2),"status",rs.getString(3)),id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Application not found");var row=rows.get(0);int score=Math.max(0,Math.min(100,100-((java.math.BigDecimal)row.get("amount")).divide(new java.math.BigDecimal("1000")).intValue()-(Integer)row.get("term")));String reason=score>=60?"Deterministic sandbox score allows review":"Deterministic sandbox score requires manual review";jdbc.update("UPDATE loan_application SET score=?,scoring_reason=?,status='SCORED',version=version+1 WHERE application_id=?",score,reason,id);return Map.of("applicationId",id.toString(),"score",score,"reason",reason,"status","SCORED");
  }
}
