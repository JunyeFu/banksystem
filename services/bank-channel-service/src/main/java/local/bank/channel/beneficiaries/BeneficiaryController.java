package local.bank.channel.beneficiaries;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class BeneficiaryController {
  private final JdbcTemplate jdbc;
  public BeneficiaryController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  @PostMapping("/api/customer/v1/beneficiaries")
  public Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Request request) throws Exception {
    if (request.accountNumber() == null || request.accountNumber().length() < 6) throw new IllegalArgumentException("accountNumber is invalid");
    String token = sha256(request.accountNumber());
    String id = UUID.randomUUID().toString();
    String last4 = request.accountNumber().substring(request.accountNumber().length() - 4);
    jdbc.update("INSERT INTO beneficiary(beneficiary_id,subject,account_token,account_last4,display_name) VALUES (?,?,?,?,?) ON CONFLICT (subject,account_token) DO NOTHING", UUID.fromString(id), jwt.getSubject(), token, last4, request.displayName());
    return Map.of("beneficiaryId", id, "maskedAccountNumber", "****" + last4, "displayName", request.displayName());
  }
  @GetMapping("/api/customer/v1/beneficiaries")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){
    var rows=jdbc.query("SELECT beneficiary_id,account_last4,display_name,created_at FROM beneficiary WHERE subject=? ORDER BY created_at DESC",(rs,n)->Map.<String,Object>of("beneficiaryId",rs.getString(1),"maskedAccountNumber","****"+rs.getString(2),"displayName",rs.getString(3),"createdAt",rs.getObject(4).toString()),jwt.getSubject());
    return Map.of("items",rows);
  }
  public record Request(String accountNumber, String displayName) {}
  private static String sha256(String input) throws Exception { byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)); StringBuilder out = new StringBuilder(); for (byte b : digest) out.append(String.format("%02x", b)); return out.toString(); }
}
