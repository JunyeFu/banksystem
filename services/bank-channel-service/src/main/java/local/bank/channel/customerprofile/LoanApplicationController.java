package local.bank.channel.customerprofile;

import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/v1/loans/applications")
public class LoanApplicationController {
  private final LoanWorkflowService workflow;
  public LoanApplicationController(LoanWorkflowService workflow) { this.workflow = workflow; }

  @PostMapping
  public Map<String, Object> draft(@AuthenticationPrincipal Jwt jwt, @RequestBody LoanWorkflowService.DraftRequest request) {
    return workflow.createDraft(jwt.getSubject(), request);
  }

  @GetMapping
  public Map<String, Object> list(@AuthenticationPrincipal Jwt jwt) {
    return workflow.customerApplications(jwt.getSubject());
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return workflow.customerApplication(jwt.getSubject(), id);
  }

  @PostMapping("/{id}/submit")
  public Map<String, Object> submit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody VersionRequest request) {
    return workflow.submit(jwt.getSubject(), id, request.version());
  }

  public record VersionRequest(long version) {}
}
