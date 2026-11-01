package local.bank.channel;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;

@Component
public class FineractTransport {
  private final RestClient client;
  public FineractTransport(@Value("${fineract.base-url}") String baseUrl,
      @Value("${fineract.tenant}") String tenant,
      @Value("${fineract.username}") String username,
      @Value("${fineract.password}") String password, CoreWriteRepository writes) {
    this.client = RestClient.builder().baseUrl(baseUrl).defaultHeaders(h -> {
      h.setBasicAuth(username, password);
      h.set("fineract-platform-tenantid", tenant);
      h.set(HttpHeaders.ACCEPT, "application/json");
    }).requestInterceptor((request, body, execution) -> {
      String reqId = MDC.get("requestId");
      String corrId = MDC.get("correlationId");
      if (reqId != null) request.getHeaders().set("X-Request-Id", reqId);
      if (corrId != null) request.getHeaders().set("X-Correlation-Id", corrId);
      String path = request.getURI().getPath();
      boolean moneyCommand = request.getMethod() != org.springframework.http.HttpMethod.GET
          && path.matches(".*/api/v1/(clients|savingsaccounts|loans|accounttransfers|tellers)(/.*)?");
      if (moneyCommand) {
        try (var lease = writes.acquire()) { return execution.execute(request, body); }
      }
      return execution.execute(request, body);
    }).build();
  }
  RestClient client() { return client; }
  static String coreIdempotencyKey(String key) {
    if (key == null || key.length() <= 48) return key;
    try {
      byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return "ch-" + java.util.HexFormat.of().formatHex(digest).substring(0, 45);
    } catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException(ex); }
  }
}
