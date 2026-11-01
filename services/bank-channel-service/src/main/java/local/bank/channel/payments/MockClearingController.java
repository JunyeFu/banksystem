package local.bank.channel.payments;

import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;

@Profile("mock-clearing")
@RestController
public class MockClearingController {
  private final MockClearingService service;
  public MockClearingController(MockClearingService service){this.service=service;}
  @PostMapping("/api/operations/v1/clearing/payments")
  public Map<String,Object> submit(@AuthenticationPrincipal Jwt jwt,@RequestHeader("Idempotency-Key") String key,@RequestBody Request request){return service.submit(UUID.fromString(request.transferId()),request.scenario(),key);}
  @PostMapping("/internal/mock-clearing/{clearingId}/deliver/{sequence}")
  public Map<String,Object> deliver(@PathVariable UUID clearingId,@PathVariable int sequence){return service.deliver(clearingId,sequence);}
  public record Request(String transferId,String scenario){}
}
