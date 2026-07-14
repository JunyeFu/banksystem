package local.bank.channel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
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
import org.springframework.http.HttpMethod;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  @Value("${bank.issuer.customer-uri:http://127.0.0.1:19000/realms/bank-customer}")
  private String customerIssuer;

  @Value("${bank.issuer.customer-jwk-uri:http://keycloak:8080/realms/bank-customer/protocol/openid-connect/certs}")
  private String customerJwk;

  @Value("${bank.issuer.internal-uri:http://127.0.0.1:19000/realms/bank-internal}")
  private String internalIssuer;

  @Value("${bank.issuer.internal-jwk-uri:http://keycloak:8080/realms/bank-internal/protocol/openid-connect/certs}")
  private String internalJwk;

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(csrf -> csrf.disable())
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/internal/health", "/actuator/health", "/actuator/info", "/error").permitAll()
            .requestMatchers("/internal/test-support/**").hasAuthority("ROLE_TEST_SUPPORT")
            .requestMatchers("/api/operations/v1/cashiers").hasAnyAuthority("ROLE_TELLER", "ROLE_CUSTOMER_SERVICE", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/savings/**").hasAnyAuthority("ROLE_TELLER", "ROLE_CUSTOMER_SERVICE", "ROLE_SYSTEM_ADMIN")
            .requestMatchers(HttpMethod.POST, "/api/operations/v1/transfers/reversals/*/approve").hasAnyAuthority("ROLE_PAYMENT_APPROVER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers(HttpMethod.POST, "/api/operations/v1/transfers/*/reversal").hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/transfers/**").hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_PAYMENT_APPROVER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers(HttpMethod.POST, "/api/operations/v1/loans/approvals/*/approve").hasAnyAuthority("ROLE_LOAN_APPROVER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/loans/**").hasAnyAuthority("ROLE_LOAN_OFFICER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers(HttpMethod.POST, "/api/operations/v1/risk/*/approve").hasAnyAuthority("ROLE_RISK_ANALYST", "ROLE_PAYMENT_APPROVER", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/risk/**").hasAnyAuthority("ROLE_RISK_ANALYST", "ROLE_PAYMENT_OPERATOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/clearing/**").hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/reconciliation/**").hasAnyAuthority("ROLE_ACCOUNTANT", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/eod/**").hasAnyAuthority("ROLE_ACCOUNTANT", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/operations/v1/audit/**").hasAnyAuthority("ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/internal/mock-clearing/**").hasAuthority("ROLE_SYSTEM_ADMIN")
            .requestMatchers("/internal/transfers/**").hasAnyAuthority("ROLE_PAYMENT_OPERATOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/api/customer/v1/loans/applications/*/core/**").denyAll()
            .requestMatchers("/api/customer/v1/loans/applications/*/core-submit").denyAll()
            .requestMatchers(HttpMethod.POST, "/api/customer/v1/beneficiaries", "/api/customer/v1/transfers")
              .hasAuthority("ROLE_CUSTOMER_MFA_VERIFIED")
            .requestMatchers("/api/customer/v1/**").hasAuthority("ROLE_CUSTOMER")
            .requestMatchers("/internal/eod/**", "/internal/monitoring/**")
              .hasAnyAuthority("ROLE_ACCOUNTANT", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .requestMatchers("/internal/reconciliation/**")
              .hasAnyAuthority("ROLE_ACCOUNTANT", "ROLE_AUDITOR", "ROLE_SYSTEM_ADMIN")
            .anyRequest().authenticated())
        .oauth2ResourceServer(oauth -> oauth.authenticationManagerResolver(authenticationManagerResolver()))
        .build();
  }

  private AuthenticationManagerResolver<HttpServletRequest> authenticationManagerResolver() {
    Map<String, AuthenticationManager> managers = Map.of(
        customerIssuer, manager(customerIssuer, customerJwk),
        internalIssuer, manager(internalIssuer, internalJwk));
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
