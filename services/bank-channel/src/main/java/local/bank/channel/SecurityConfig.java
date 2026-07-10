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
import java.util.Collection;
import java.util.ArrayList;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;

@Configuration
public class SecurityConfig {
  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(csrf -> csrf.disable())
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/internal/health", "/actuator/health", "/error").permitAll()
            .requestMatchers("/api/operations/v1/cashiers").hasAnyAuthority("ROLE_TELLER", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/savings/**").hasAnyAuthority("ROLE_TELLER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/transfers/**").hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_PAYMENT_APPROVER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/risk/**", "/api/operations/v1/clearing/**", "/internal/mock-clearing/**")
              .hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_PAYMENT_APPROVER", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/internal/eod/**", "/internal/monitoring/**")
              .hasAnyAuthority("ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN", "ROLE_PAYMENT_APPROVER")
            .requestMatchers("/internal/reconciliation/**")
              .hasAnyAuthority("ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN", "ROLE_PAYMENT_APPROVER")
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
    var provider = new JwtAuthenticationProvider(decoder);
    provider.setJwtAuthenticationConverter(jwtAuthenticationConverter());
    return new ProviderManager(provider);
  }

  private JwtAuthenticationConverter jwtAuthenticationConverter() {
    var converter = new JwtAuthenticationConverter();
    var scopes = new JwtGrantedAuthoritiesConverter();
    converter.setJwtGrantedAuthoritiesConverter(jwt -> {
      Collection<GrantedAuthority> authorities = new ArrayList<>(scopes.convert(jwt));
      Object realmAccess = jwt.getClaims().get("realm_access");
      if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof Collection<?> roles) {
        for (Object role : roles) authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
      }
      return authorities;
    });
    return converter;
  }
}
