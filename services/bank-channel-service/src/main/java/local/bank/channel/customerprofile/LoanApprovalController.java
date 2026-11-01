package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operations/v1/loans")
public class LoanApprovalController {
  private final LoanWorkflowService workflow;
  public LoanApprovalController(LoanWorkflowService workflow) { this.workflow = workflow; }

  @PostMapping("/applications/{id}/approval")
  public Map<String, Object> request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ApprovalRequest request) {
    return workflow.requestApproval(id, jwt.getSubject(), request.version(), request.reason());
  }

  @PostMapping("/approvals/{id}/approve")
  public Map<String, Object> approve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ApproveRequest request) {
    return workflow.approve(id, jwt.getSubject(), request.version(),
        new LoanWorkflowService.ApprovalDecision(request.approvedAmount(), request.annualInterestRate(), request.reason()));
  }

  public record ApprovalRequest(long version, String reason) {}
  public record ApproveRequest(long version, BigDecimal approvedAmount, BigDecimal annualInterestRate, String reason) {}
}
