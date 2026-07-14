package local.bank.channel.identity;

import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAdapter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@RestController
public class CustomerController {
  private final FineractAdapter fineract;
  private final JdbcTemplate jdbc;
  public CustomerController(FineractAdapter fineract, JdbcTemplate jdbc) { this.fineract = fineract; this.jdbc = jdbc; }

  @GetMapping("/api/customer/v1/accounts")
  public Map<String, Object> accounts(@AuthenticationPrincipal Jwt jwt) {
    return Map.of("items", fineract.clientAccounts(linkedClient(jwt.getSubject())).stream().map(this::summary).toList());
  }

  @GetMapping("/api/customer/v1/accounts/{accountId}")
  public Map<String, Object> account(@AuthenticationPrincipal Jwt jwt, @PathVariable String accountId) {
    return fineract.clientAccounts(linkedClient(jwt.getSubject())).stream()
        .filter(a -> accountId.equals(String.valueOf(a.getOrDefault("id", a.get("accountId")))))
        .findFirst().map(this::summary)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account is not linked"));
  }

  private long linkedClient(String subject) {
    List<Long> ids = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject = ?", (rs, n) -> rs.getLong(1), subject);
    if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer identity is not linked");
    return ids.get(0);
  }
  public long linkedClientForStatement(String subject) { return linkedClient(subject); }

  private Map<String, Object> summary(Map<String, Object> source) {
    String raw = String.valueOf(source.getOrDefault("accountNo", source.getOrDefault("accountNumber", "")));
    String masked = raw.length() <= 4 ? "****" : "****" + raw.substring(raw.length() - Math.min(4, raw.length()));
    Object balance = source.getOrDefault("accountBalance", source.getOrDefault("balance", "0.00"));
    Object currency = source.getOrDefault("currency", source.getOrDefault("currencyCode", ""));
    if (currency instanceof Map<?, ?> map) { Object code = map.get("code"); currency = code == null ? "" : code; }
    return Map.of("accountId", String.valueOf(source.getOrDefault("id", source.getOrDefault("accountId", ""))), "maskedAccountNumber", masked, "currency", String.valueOf(currency), "balance", String.valueOf(balance));
  }

  @GetMapping("/api/customer/v1/customers/me")
  public Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
    String displayName = jwt.getClaimAsString("name");
    if (displayName == null || displayName.isBlank()) displayName = jwt.getClaimAsString("preferred_username");
    if (displayName == null || displayName.isBlank()) displayName = jwt.getSubject();
    return Map.of("customerId", jwt.getSubject(), "displayName", displayName);
  }

  @GetMapping("/api/customer/v1/loans")
  public Map<String,Object> loans(@AuthenticationPrincipal Jwt jwt){return Map.of("items",fineract.clientLoans(linkedClient(jwt.getSubject())));}
}
