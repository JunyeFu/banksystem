package local.bank.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class FineractAdapter {
  private static final Logger LOG = LoggerFactory.getLogger(FineractAdapter.class);
  private final RestClient client;
  private final String tenant;
  private final ObjectMapper mapper;
  private final String baseUrl;
  private final String username;
  private final String password;
  private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

  public FineractAdapter(
      @Value("${fineract.base-url}") String baseUrl,
      @Value("${fineract.tenant}") String tenant,
      @Value("${fineract.username}") String username,
      @Value("${fineract.password}") String password,
      ObjectMapper mapper) {
    this.tenant = tenant;
    this.mapper = mapper;
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    this.client = RestClient.builder().baseUrl(baseUrl).defaultHeaders(h -> {
      h.setBasicAuth(username, password);
      h.set("fineract-platform-tenantid", tenant);
      h.set(HttpHeaders.ACCEPT, "application/json");
    }).build();
  }

  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> clientAccounts(long clientId) {
    Map<String, Object> body = client.get().uri("/api/v1/clients/{id}/accounts", clientId)
        .retrieve().body(Map.class);
    if (body == null) return List.of();
    Object savings = body.get("savingsAccounts");
    Object loans = body.get("loanAccounts");
    java.util.ArrayList<Map<String, Object>> result = new java.util.ArrayList<>();
    if (savings instanceof List<?> list) list.forEach(x -> { if (x instanceof Map<?, ?> m) result.add((Map<String,Object>) m); });
    if (loans instanceof List<?> list) list.forEach(x -> { if (x instanceof Map<?, ?> m) result.add((Map<String,Object>) m); });
    return result;
  }

  public Map<String, Object> accountTransfer(long fromAccountId, long toAccountId, java.math.BigDecimal amount, String currency, String idempotencyKey) {
    Map<String, Object> from = accountDetails(fromAccountId);
    Map<String, Object> to = accountDetails(toAccountId);
    AccountTransferRequest body = new AccountTransferRequest(fromAccountId, toAccountId, amount, LocalDate.now().toString(), 2, 2, 1, ((Number) from.get("clientId")).longValue(), 1, ((Number) to.get("clientId")).longValue(), "Local channel transfer", "en", "yyyy-MM-dd", currency);
    try {
      String json = mapper.writeValueAsString(body);
      String auth = Base64.getEncoder().encodeToString((username + ":" + password).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
      String query = "?fromOfficeId=1&fromClientId=" + ((Number) from.get("clientId")).longValue() + "&toOfficeId=1&toClientId=" + ((Number) to.get("clientId")).longValue() + "&transferDescription=Local%20channel%20transfer";
      HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/v1/accounttransfers" + query))
          .header("Authorization", "Basic " + auth).header("fineract-platform-tenantid", tenant)
          .header("Content-Type", MediaType.APPLICATION_JSON_VALUE).header("Accept", MediaType.APPLICATION_JSON_VALUE)
          .header("Idempotency-Key", idempotencyKey).header("X-Idempotency-Key", idempotencyKey)
          .POST(HttpRequest.BodyPublishers.ofByteArray(json.getBytes(java.nio.charset.StandardCharsets.UTF_8))).build();
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 400) throw org.springframework.web.client.HttpClientErrorException.create(org.springframework.http.HttpStatusCode.valueOf(response.statusCode()), "Fineract transfer rejected", org.springframework.http.HttpHeaders.EMPTY, response.body().getBytes(java.nio.charset.StandardCharsets.UTF_8), java.nio.charset.StandardCharsets.UTF_8);
      return mapper.readValue(response.body(), Map.class);
    } catch (java.io.IOException | InterruptedException ex) { if (ex instanceof InterruptedException) Thread.currentThread().interrupt(); throw new IllegalStateException("Core transfer request failed", ex); }
  }

  private record AccountTransferRequest(long fromAccountId, long toAccountId, java.math.BigDecimal transferAmount, String transferDate, int fromAccountType, int toAccountType, int fromOfficeId, long fromClientId, int toOfficeId, long toClientId, String transferDescription, String locale, String dateFormat, String currencyCode) {}

  @SuppressWarnings("unchecked")
  private Map<String, Object> accountDetails(long accountId) {
    return client.get().uri("/api/v1/savingsaccounts/{id}", accountId).retrieve().body(Map.class);
  }
}
