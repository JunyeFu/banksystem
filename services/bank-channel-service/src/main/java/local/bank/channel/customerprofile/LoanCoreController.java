package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractLoanPort;
import local.bank.channel.FineractOperationsPort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class LoanCoreController {
  private final LoanOperationService loanOperations;
  private final LoanWorkflowService workflow;

  public LoanCoreController(LoanOperationService loanOperations, LoanWorkflowService workflow) {
    this.loanOperations = loanOperations;
    this.workflow = workflow;
  }

  @PostMapping("/api/operations/v1/loans/applications/{id}/core-submit")
  public Map<String, Object> coreSubmit(
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String idempotencyKey) {
    return workflow.submitToCore(id, idempotencyKey);
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/repayment")
  public Map<String, Object> repayment(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody Map<String, Object> body) {
    BigDecimal amount;
    try { amount = new BigDecimal(String.valueOf(body.get("transactionAmount"))); }
    catch (NumberFormatException error) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "transactionAmount is invalid");
    }
    if (amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 2 || amount.precision() - amount.scale() > 17)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "transactionAmount must be positive money with at most two decimals");
    if (key == null || key.isBlank())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required");
    return loanOperations.execute(jwt.getSubject(),id,key,"repayment",amount);
  }

  @PostMapping("/api/customer/v1/loans/applications/{id}/close")
  public Map<String, Object> close(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key) {
    return loanOperations.execute(jwt.getSubject(),id,key,"close",null);
  }

}
