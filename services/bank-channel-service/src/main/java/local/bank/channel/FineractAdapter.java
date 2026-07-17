package local.bank.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.Base64;

@Component
public class FineractAdapter {
  private final RestClient client;
  private final String tenant;
  private final ObjectMapper mapper;
  private final String baseUrl;
  private final String username;
  private final String password;

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
    }).requestInterceptor((request, body, execution) -> {
      String reqId = MDC.get("requestId");
      String corrId = MDC.get("correlationId");
      if (reqId != null) request.getHeaders().set("X-Request-Id", reqId);
      if (corrId != null) request.getHeaders().set("X-Correlation-Id", corrId);
      return execution.execute(request, body);
    }).build();
  }

  public boolean checkHealth() {
    try {
      client.get().uri("/actuator/health").retrieve().toBodilessEntity();
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  public LocalDate businessDate() {
    return readBusinessDate("BUSINESS_DATE");
  }

  public LocalDate cobDate() {
    return readBusinessDate("COB_DATE");
  }

  @SuppressWarnings("unchecked")
  private LocalDate readBusinessDate(String type) {
    Map<String, Object> body = client.get().uri("/api/v1/businessdate/{type}", type).retrieve().body(Map.class);
    Object rawDate = body == null ? null : body.get("date");
    if (rawDate instanceof List<?> date && date.size() == 3) {
      return LocalDate.of(((Number) date.get(0)).intValue(), ((Number) date.get(1)).intValue(), ((Number) date.get(2)).intValue());
    }
    throw new IllegalStateException("Fineract " + type + " is unavailable");
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> advanceBusinessDate(LocalDate nextDate) {
    Map<String, Object> body = Map.of(
        "date", nextDate.toString(),
        "dateFormat", "yyyy-MM-dd",
        "locale", "en",
        "type", "BUSINESS_DATE");
    return client.post().uri("/api/v1/businessdate").body(body).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> runJob(int jobId) {
    return client.post().uri(uri -> uri.path("/api/v1/jobs/{jobId}").queryParam("command", "executeJob").build(jobId))
        .body(Map.of()).retrieve().body(Map.class);
  }

  public Map<String, Object> runCobBatch() { return runJob(31); }

  public Map<String, Object> postInterestOnSavings() { return runJob(6); }

  public Map<String, Object> applyAnnualFeeForSavings() { return runJob(4); }

  public Map<String, Object> payDueSavingsCharges() { return runJob(8); }

  public Map<String, Object> updateLoanArrearsAgeing() { return runJob(2); }

  public Map<String, Object> applyPenaltyToOverdueLoans() { return runJob(12); }

  public Map<String, Object> transferInterestToSavings() { return runJob(14); }

  public Map<String, Object> updateAccountingRunningBalances() { return runJob(9); }

  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> clientAccounts(long clientId) {
    Map<String, Object> body = client.get().uri("/api/v1/clients/{id}/accounts", clientId)
        .retrieve().body(Map.class);
    if (body == null) return List.of();
    Object savings = body.get("savingsAccounts");
    java.util.ArrayList<Map<String, Object>> result = new java.util.ArrayList<>();
    if (savings instanceof List<?> list) list.forEach(x -> { if (x instanceof Map<?, ?> m) result.add((Map<String,Object>) m); });
    return result;
  }

  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> clientLoans(long clientId) {
    Map<String,Object> body=client.get().uri("/api/v1/clients/{id}/accounts",clientId).retrieve().body(Map.class);
    if(body==null||!(body.get("loanAccounts") instanceof List<?> list))return List.of();
    return list.stream().filter(x->x instanceof Map<?,?>).map(x->(Map<String,Object>)x).toList();
  }

  @SuppressWarnings("unchecked")
  public long resolveSavingsAccountId(String accountNumber) {
    if (accountNumber == null || accountNumber.isBlank()) {
      throw new IllegalArgumentException("accountNumber is required");
    }
    List<Map<String, Object>> results = client.get().uri(uri -> uri
            .path("/api/v1/search")
            .queryParam("query", accountNumber.trim())
            .queryParam("resource", "savingsaccounts")
            .queryParam("exactMatch", true)
            .build())
        .retrieve().body(List.class);
    if (results == null) results = List.of();
    return selectSavingsAccountId(results, accountNumber);
  }

  static long selectSavingsAccountId(List<Map<String, Object>> results, String accountNumber) {
    List<Map<String, Object>> exact = results.stream()
        .filter(row -> accountNumber.trim().equals(String.valueOf(row.get("entityAccountNo"))))
        .toList();
    if (exact.size() != 1 || !(exact.get(0).get("entityId") instanceof Number id)) {
      throw new IllegalArgumentException("Savings account could not be resolved uniquely");
    }
    return id.longValue();
  }

  public Map<String, Object> accountTransfer(long fromAccountId, long toAccountId, java.math.BigDecimal amount, String currency, String idempotencyKey) {
    Map<String, Object> from = accountDetails(fromAccountId);
    Map<String, Object> to = accountDetails(toAccountId);
    AccountTransferRequest body = new AccountTransferRequest(fromAccountId, toAccountId, amount, businessDate().toString(), 2, 2, 1, ((Number) from.get("clientId")).longValue(), 1, ((Number) to.get("clientId")).longValue(), "Local channel transfer", "en", "yyyy-MM-dd", currency);
    try {
      String json = mapper.writeValueAsString(body);
      String auth = Base64.getEncoder().encodeToString((username + ":" + password).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
      String query = "?fromOfficeId=1&fromClientId=" + ((Number) from.get("clientId")).longValue() + "&toOfficeId=1&toClientId=" + ((Number) to.get("clientId")).longValue() + "&transferDescription=Local%20channel%20transfer";
      java.net.HttpURLConnection connection = (java.net.HttpURLConnection) new java.net.URL(baseUrl + "/api/v1/accounttransfers" + query).openConnection();
      connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setFixedLengthStreamingMode(json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
      connection.setRequestProperty("Authorization", "Basic " + auth); connection.setRequestProperty("fineract-platform-tenantid", tenant);
      connection.setRequestProperty("Content-Type", MediaType.APPLICATION_JSON_VALUE); connection.setRequestProperty("Accept", MediaType.APPLICATION_JSON_VALUE);
      String coreKey = coreIdempotencyKey(idempotencyKey);
      connection.setRequestProperty("Idempotency-Key", coreKey); connection.setRequestProperty("X-Idempotency-Key", coreKey);
      String reqId = MDC.get("requestId"); String corrId = MDC.get("correlationId");
      if (reqId != null) connection.setRequestProperty("X-Request-Id", reqId);
      if (corrId != null) connection.setRequestProperty("X-Correlation-Id", corrId);
      try (var output = connection.getOutputStream()) { output.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
      int status = connection.getResponseCode();
      try (var input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
        String response = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        if (status >= 400) throw org.springframework.web.client.HttpClientErrorException.create(org.springframework.http.HttpStatusCode.valueOf(status), "Fineract transfer rejected", org.springframework.http.HttpHeaders.EMPTY, response.getBytes(java.nio.charset.StandardCharsets.UTF_8), java.nio.charset.StandardCharsets.UTF_8);
        return mapper.readValue(response, Map.class);
      }
    } catch (java.io.IOException ex) { throw new IllegalStateException("Core transfer request failed", ex); }
  }

  private String coreIdempotencyKey(String key) {
    if (key == null || key.length() <= 48) return key;
    try {
      byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return "ch-" + java.util.HexFormat.of().formatHex(digest).substring(0, 45);
    } catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException(ex); }
  }

  private record AccountTransferRequest(long fromAccountId, long toAccountId, java.math.BigDecimal transferAmount, String transferDate, int fromAccountType, int toAccountType, int fromOfficeId, long fromClientId, int toOfficeId, long toClientId, String transferDescription, String locale, String dateFormat, String currencyCode) {}

  @SuppressWarnings("unchecked")
  public Map<String, Object> accountDetails(long accountId) {
    return client.get().uri("/api/v1/savingsaccounts/{id}", accountId).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> cashiers(){var body=client.get().uri("/api/v1/cashiers").retrieve().body(List.class);return body==null?List.of():body;}

  @SuppressWarnings("unchecked")
  public Map<String, Object> createClient(String displayName, String mobileNo) {
    String[] parts = displayName.split(" ", 2);
    String firstname = parts.length >= 2 ? parts[0] : "Test";
    String lastname = parts.length >= 2 ? parts[1] : displayName;
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("officeId", 1);
    body.put("firstname", firstname);
    body.put("lastname", lastname);
    body.put("externalId", "fixture-" + java.util.UUID.randomUUID().toString().substring(0, 8));
    body.put("active", true);
    body.put("activationDate", LocalDate.of(2020, 1, 1).toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    if (mobileNo != null && !mobileNo.isBlank()) body.put("mobileNo", mobileNo);
    body.put("legalFormId", 1);
    return client.post().uri("/api/v1/clients").body(body).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> createSavingsAccount(long clientId, int productId, String currency) {
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("clientId", clientId);
    body.put("productId", productId);
    body.put("nominalAnnualInterestRate", java.math.BigDecimal.ZERO);
    body.put("interestCompoundingPeriodType", 1);
    body.put("interestPostingPeriodType", 4);
    body.put("interestCalculationType", 1);
    body.put("interestCalculationDaysInYearType", 365);
    body.put("lockinPeriodFrequency", 0);
    body.put("lockinPeriodFrequencyType", 0);
    body.put("submittedOnDate", LocalDate.of(2020, 1, 1).toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    return client.post().uri("/api/v1/savingsaccounts").body(body).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> savingsCommand(long accountId, String command, Map<String, Object> body) {
    if (!java.util.Set.of("block", "unblock", "close", "prematureClose", "activate", "deposit", "withdrawal").contains(command)) throw new IllegalArgumentException("Unsupported savings command");
    Map<String, Object> payload = body == null ? new java.util.HashMap<>() : new java.util.HashMap<>(body);
    if (command.equals("block")) { Object reason = payload.getOrDefault("reasonForBlock", payload.getOrDefault("note", "Channel operations block")); payload.put("reasonForBlock", reason); }
    if (command.equals("close") || command.equals("prematureClose")) { payload.putIfAbsent("closedOnDate", LocalDate.now().toString()); payload.putIfAbsent("dateFormat", "yyyy-MM-dd"); payload.putIfAbsent("locale", "en"); }
    if (command.equals("activate")) { payload.putIfAbsent("activatedOnDate", LocalDate.now().toString()); payload.putIfAbsent("dateFormat", "yyyy-MM-dd"); payload.putIfAbsent("locale", "en"); }
    return client.post().uri(uri -> uri.path("/api/v1/savingsaccounts/{id}").queryParam("command", command).build(accountId)).body(payload).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> savingsTransactions(long accountId,String fromDate,String toDate){
    Map<String,Object> body=client.get().uri(uri->{var b=uri.path("/api/v1/savingsaccounts/{id}/transactions/search").queryParam("limit",1000);if(fromDate!=null&&!fromDate.isBlank())b.queryParam("fromDate",fromDate);if(toDate!=null&&!toDate.isBlank())b.queryParam("toDate",toDate);return b.build(accountId);}).retrieve().body(Map.class);
    if(body==null||!(body.get("content") instanceof List<?> list))return List.of();return list.stream().filter(x->x instanceof Map<?,?>).map(x->(Map<String,Object>)x).toList();
  }

  public Map<String,Object> submitLoan(Map<String,Object> body, String idempotencyKey){
    String coreKey=coreIdempotencyKey(idempotencyKey); return client.post().uri("/api/v1/loans").header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey).body(body).retrieve().body(Map.class);
  }

  public Map<String,Object> loanCommand(long loanId, String command, Map<String,Object> body, String idempotencyKey){
    if(!java.util.Set.of("approve","reject","withdrawnByApplicant","disburse","undodisbursal","undoapproval").contains(command)) throw new IllegalArgumentException("Unsupported loan command");
    String coreKey=coreIdempotencyKey(idempotencyKey); return client.post().uri(uri->uri.path("/api/v1/loans/{id}").queryParam("command",command).build(loanId)).header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey).body(body==null?Map.of():body).retrieve().body(Map.class);
  }

  public Map<String,Object> loanDetails(long loanId){return client.get().uri(uri->uri.path("/api/v1/loans/{id}").queryParam("associations","all").build(loanId)).retrieve().body(Map.class);}

  public Map<String,Object> loanTransaction(long loanId, String command, Map<String,Object> body, String idempotencyKey){
    if(!java.util.Set.of("repayment","foreclosure","close","writeoff","undowriteoff").contains(command)) throw new IllegalArgumentException("Unsupported loan transaction");
    String coreKey=coreIdempotencyKey(idempotencyKey); return client.post().uri(uri->uri.path("/api/v1/loans/{id}/transactions").queryParam("command",command).build(loanId)).header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey).body(body==null?Map.of():body).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public List<Map<String,Object>> journalEntries(){
    Map<String,Object> body=client.get().uri(uri->uri.path("/api/v1/journalentries").queryParam("limit",1000).queryParam("transactionDetails",true).build()).retrieve().body(Map.class);
    if(body==null||!(body.get("pageItems") instanceof List<?> list))return List.of();return list.stream().filter(x->x instanceof Map<?,?>).map(x->(Map<String,Object>)x).toList();
  }
}
