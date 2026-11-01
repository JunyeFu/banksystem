package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class SecurityConfigTest {
  private Jwt token(List<String> audience, String authorizedParty) {
    return Jwt.withTokenValue("signed-token")
        .header("alg", "RS256")
        .issuedAt(Instant.now())
        .expiresAt(Instant.now().plusSeconds(300))
        .audience(audience)
        .claim("azp", authorizedParty)
        .claim("realm_access", java.util.Map.of("roles", List.of("CUSTOMER", "SYSTEM_ADMIN")))
        .build();
  }

  @Test
  void acceptsOnlyTheBankAudienceAndRealmClient() {
    assertFalse(SecurityConfig.validateApiClaims(token(List.of("bank-channel-service"), "customer-portal"), Set.of("customer-portal")).hasErrors());
    assertTrue(SecurityConfig.validateApiClaims(token(List.of("other-api"), "customer-portal"), Set.of("customer-portal")).hasErrors());
    assertTrue(SecurityConfig.validateApiClaims(token(List.of("bank-channel-service"), "other-client"), Set.of("customer-portal")).hasErrors());
    assertTrue(SecurityConfig.validateApiClaims(token(List.of("bank-channel-service"), "operations-console"), Set.of("customer-portal")).hasErrors());
    assertFalse(SecurityConfig.validateApiClaims(token(List.of("bank-channel-service"), "operations-console"), Set.of("operations-console", "bank-channel-service")).hasErrors());
  }
}
