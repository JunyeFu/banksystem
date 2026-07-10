package local.bank.channel;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider;
import org.springframework.security.oauth2.server.resource.authentication.JwtIssuerAuthenticationManagerResolver;
import org.springframework.security.authentication.AuthenticationManagerResolver;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@Configuration
public class SecurityConfig {
  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(csrf -> csrf.disable())
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/internal/health", "/actuator/health", "/error").permitAll()
            .anyRequest().authenticated())
        .oauth2ResourceServer(oauth -> oauth.authenticationManagerResolver(authenticationManagerResolver()))
        .build();
  }

  private AuthenticationManagerResolver<HttpServletRequest> authenticationManagerResolver() {
    String customer = "http://127.0.0.1:18082/realms/bank-customer";
    String internal = "http://127.0.0.1:18082/realms/bank-internal";
    Map<String, AuthenticationManager> managers = Map.of(
        customer, manager(customer, "http://keycloak:8080/realms/bank-customer/protocol/openid-connect/certs"),
        internal, manager(internal, "http://keycloak:8080/realms/bank-internal/protocol/openid-connect/certs"));
    return new JwtIssuerAuthenticationManagerResolver(issuer -> managers.get(issuer));
  }

  private AuthenticationManager manager(String issuer, String jwkSetUri) {
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
    return new ProviderManager(new JwtAuthenticationProvider(decoder));
  }
}
