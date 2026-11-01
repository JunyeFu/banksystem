package local.bank.channel.documents;

import java.util.Map;
import java.util.UUID;
import local.bank.channel.customerprofile.LoanWorkflowService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/v1/loans/applications/{id}/documents")
public class LoanDocumentController {
  private final LoanWorkflowService workflow;
  public LoanDocumentController(LoanWorkflowService workflow) { this.workflow = workflow; }

  @PostMapping
  public Map<String, Object> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody Request request) {
    return workflow.addDocument(jwt.getSubject(), id, request.documentType());
  }

  @GetMapping
  public Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return workflow.documents(jwt.getSubject(), id);
  }

  public record Request(String documentType) {}
}
