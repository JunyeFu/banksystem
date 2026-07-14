package local.bank.channel.accounts;

import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAdapter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CashierController {
  private final FineractAdapter adapter;
  public CashierController(FineractAdapter adapter){this.adapter=adapter;}
  @GetMapping("/api/operations/v1/cashiers")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){return Map.of("items",adapter.cashiers());}
}
