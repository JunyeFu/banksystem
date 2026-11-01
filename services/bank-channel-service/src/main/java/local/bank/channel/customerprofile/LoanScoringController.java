package local.bank.channel.customerprofile;

import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operations/v1/loans/applications")
public class LoanScoringController {
  private final LoanWorkflowService workflow;
  public LoanScoringController(LoanWorkflowService workflow) { this.workflow = workflow; }

  @PostMapping("/{id}/score")
  public Map<String, Object> score(@PathVariable UUID id, @RequestBody VersionRequest request) {
    return workflow.score(id, request.version());
  }

  public record VersionRequest(long version) {}
}
