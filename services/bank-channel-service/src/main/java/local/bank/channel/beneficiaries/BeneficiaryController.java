package local.bank.channel.beneficiaries;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import local.bank.channel.FineractAdapter;

@RestController
public class BeneficiaryController {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  public BeneficiaryController(JdbcTemplate jdbc, FineractAdapter fineract) {
    this.jdbc = jdbc;
    this.fineract = fineract;
  }
  @PostMapping("/api/customer/v1/beneficiaries")
  @Transactional
  public Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Request request) throws Exception {
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
    String token = sha256(accountNumber);
    String id = UUID.randomUUID().toString();
    String last4 = accountNumber.substring(accountNumber.length() - 4);
    jdbc.update("INSERT INTO beneficiary(beneficiary_id,subject,account_token,account_last4,display_name,destination_account_id) VALUES (?,?,?,?,?,?) "
        + "ON CONFLICT (subject,account_token) DO UPDATE SET display_name=EXCLUDED.display_name,destination_account_id=EXCLUDED.destination_account_id,updated_at=now()",
        UUID.fromString(id), jwt.getSubject(), token, last4, request.displayName().trim(), String.valueOf(destinationAccountId));
    var rows = jdbc.query("SELECT beneficiary_id,account_last4,display_name,created_at FROM beneficiary WHERE subject=? AND account_token=?",
        (rs,n) -> beneficiary(rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4).toString()), jwt.getSubject(), token);
    return rows.get(0);
  }
  @GetMapping("/api/customer/v1/beneficiaries")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){
    var rows=jdbc.query("SELECT beneficiary_id,account_last4,display_name,created_at FROM beneficiary WHERE subject=? AND destination_account_id IS NOT NULL ORDER BY created_at DESC",
        (rs,n)->beneficiary(rs.getString(1),rs.getString(2),rs.getString(3),rs.getObject(4).toString()),jwt.getSubject());
    return Map.of("items",rows);
  }
  public record Request(String accountNumber, String displayName) {}
  private static String sha256(String input) throws Exception { byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)); StringBuilder out = new StringBuilder(); for (byte b : digest) out.append(String.format("%02x", b)); return out.toString(); }
  private static Map<String,Object> beneficiary(String id, String last4, String displayName, String createdAt) {
    return Map.of("beneficiaryId", id, "maskedAccountNumber", "****" + last4,
        "displayName", displayName, "createdAt", createdAt);
  }
}
