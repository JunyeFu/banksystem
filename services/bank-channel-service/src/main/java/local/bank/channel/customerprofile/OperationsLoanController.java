package local.bank.channel.customerprofile;

import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operations/v1/loans/applications")
public class OperationsLoanController {
  private final LoanWorkflowService workflow;
  public OperationsLoanController(LoanWorkflowService workflow) { this.workflow = workflow; }

  @GetMapping
  public Map<String, Object> list() { return workflow.operationsApplications(); }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable UUID id) { return workflow.operationsApplication(id); }
}
