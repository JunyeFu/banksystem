package local.bank.channel.beneficiaries;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import local.bank.channel.FineractAccountPort;

@RestController
public class BeneficiaryController {
  private final BeneficiaryRepository repository;
  private final FineractAccountPort fineract;
  private final BeneficiaryTokenService tokens;
  public BeneficiaryController(BeneficiaryRepository repository, FineractAccountPort fineract, BeneficiaryTokenService tokens) {
    this.repository = repository;
    this.fineract = fineract;
    this.tokens = tokens;
  }
  @PostMapping("/api/customer/v1/beneficiaries")
  @Transactional
  public Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Request request) {
    if (request.accountNumber() == null || request.accountNumber().trim().length() < 6
        || request.displayName() == null || request.displayName().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Beneficiary details are invalid");
    }
    String accountNumber = request.accountNumber().trim();
    long destinationAccountId;
    try {
      destinationAccountId = fineract.resolveSavingsAccountId(accountNumber);
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }
    String token = tokens.token(accountNumber);
    String last4 = accountNumber.substring(accountNumber.length() - 4);
    return repository.save(jwt.getSubject(), String.valueOf(destinationAccountId), token, last4, request.displayName().trim());
  }
  @GetMapping("/api/customer/v1/beneficiaries")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){
    return repository.list(jwt.getSubject());
  }
  public record Request(String accountNumber, String displayName) {}
}
