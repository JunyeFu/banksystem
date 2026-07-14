package local.bank.channel.risk;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class RiskController {
  private final RiskService service;
  public RiskController(RiskService service){this.service=service;}
  @PostMapping("/api/operations/v1/risk/evaluate")
  public Map<String,Object> evaluate(@AuthenticationPrincipal Jwt jwt,@RequestBody Request request){return service.evaluate(UUID.fromString(request.transferId()),request.amount(),jwt.getSubject());}
  @PostMapping("/api/operations/v1/risk/{decisionId}/approve")
  public Map<String,Object> approve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID decisionId,@RequestParam int version,@RequestParam String reason){return service.approve(decisionId,jwt.getSubject(),version,reason);}
  public record Request(String transferId,BigDecimal amount){}
}
