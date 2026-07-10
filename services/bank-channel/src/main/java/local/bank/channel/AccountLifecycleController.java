package local.bank.channel;

import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class AccountLifecycleController {
  private final FineractAdapter adapter;
  public AccountLifecycleController(FineractAdapter adapter){this.adapter=adapter;}
  @PostMapping("/api/operations/v1/savings/{accountId}/command/{command}")
  public Map<String,Object> command(@AuthenticationPrincipal Jwt jwt,@PathVariable long accountId,@PathVariable String command,@RequestBody(required=false) Map<String,Object> body){return adapter.savingsCommand(accountId,command,body);}
}
