package local.bank.channel;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FineractAccountPort {
  public void ensureTransferAccounting() { operations.ensureLiabilityTransferMapping(); }
  public record SavingsProduct(long id, String name) { }
  public record SavingsAccount(long id, Long clientId, String accountNumber, String currency,
                               BigDecimal balance, String productName, String status,
                               String statusCode, LocalDate openedOn) { }
  public record SavingsTransaction(String id, String date, String type, String description,
                                   BigDecimal amount, String currency, BigDecimal runningBalance,
                                   String counterparty, boolean reversed) { }
  public record Cashier(Long id, JsonNode corePayload) { }
  public record SavingsDeposit(long accountId, Long transactionId) { }
  public record TransferLeg(long transactionId, long transferId, BigDecimal amount, String currency, String direction) { }
  public record SavingsLedgerView(int accountingRule, Long controlAccountId, List<TransferLeg> transfers) { }
  private static final ObjectMapper JSON = new ObjectMapper();
  private final RestClient client;
  private final FineractOperationsPort operations;
  public FineractAccountPort(FineractTransport transport, FineractOperationsPort operations) {
    this.client = transport.client(); this.operations = operations;
  }

  public List<SavingsAccount> clientAccounts(long clientId) {
    Map<?, ?> body = client.get().uri("/api/v1/clients/{id}/accounts", clientId)
        .retrieve().body(Map.class);
    if (body == null) return List.of();
    Object savings = body.get("savingsAccounts");
    java.util.ArrayList<SavingsAccount> result = new java.util.ArrayList<>();
    if (savings instanceof List<?> list) list.forEach(x -> { if (x instanceof Map<?, ?> m) result.add(account(m)); });
    return result;
  }

  public List<SavingsProduct> savingsProducts() {
    List<?> body = client.get().uri("/api/v1/savingsproducts").retrieve().body(List.class);
    if (body == null) return List.of();
    return body.stream().map(item -> {
      Map<?, ?> product = (Map<?, ?>) item;
      return new SavingsProduct(((Number) product.get("id")).longValue(), String.valueOf(product.get("name")));
    }).toList();
  }


  @SuppressWarnings("unchecked")
  public boolean ensureCurrencyEnabled(String currency) {
    Map<String, Object> body = client.get().uri("/api/v1/currencies").retrieve().body(Map.class);
    List<String> selected = new java.util.ArrayList<>();
    Object options = body == null ? null : body.get("selectedCurrencyOptions");
    if (options instanceof List<?> list) {
      for (Object option : list) {
        if (option instanceof Map<?, ?> map && map.get("code") != null) selected.add(String.valueOf(map.get("code")));
      }
    }
    if (selected.contains(currency)) return false;
    selected.add(currency);
    client.put().uri("/api/v1/currencies").body(Map.of("currencies", selected)).retrieve().toBodilessEntity();
    return true;
  }

  public SavingsProduct createSavingsProduct(String name, String shortName, String currency) {
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("name", name);
    body.put("shortName", shortName);
    body.put("description", "BankSystem synthetic demo savings product");
    body.put("currencyCode", currency);
    body.put("digitsAfterDecimal", 2);
    body.put("inMultiplesOf", 0);
    body.put("nominalAnnualInterestRate", java.math.BigDecimal.ZERO);
    body.put("interestCompoundingPeriodType", 1);
    body.put("interestPostingPeriodType", 4);
    body.put("interestCalculationType", 1);
    body.put("interestCalculationDaysInYearType", 365);
    body.put("accountingRule", 2);
    body.put("savingsReferenceAccountId", operations.ensureGlAccount("BSG1001", "Demo cash reference", 1));
    body.put("savingsControlAccountId", operations.ensureGlAccount("BSG2001", "Demo savings control", 2));
    body.put("interestOnSavingsAccountId", operations.ensureGlAccount("BSG5001", "Demo savings interest", 5));
    body.put("incomeFromFeeAccountId", operations.ensureGlAccount("BSG4001", "Demo savings fees", 4));
    body.put("incomeFromPenaltyAccountId", operations.ensureGlAccount("BSG4002", "Demo savings penalties", 4));
    body.put("transfersInSuspenseAccountId", operations.ensureGlAccount("BSG2002", "Demo transfer suspense", 2));
    body.put("overdraftPortfolioControlId", operations.ensureGlAccount("BSG1003", "Demo overdraft receivable", 1));
    body.put("incomeFromInterestId", operations.ensureGlAccount("BSG4003", "Demo overdraft interest income", 4));
    body.put("writeOffAccountId", operations.ensureGlAccount("BSG5002", "Demo write-off expense", 5));
    body.put("locale", "en");
    Map<?, ?> response = client.post().uri("/api/v1/savingsproducts").body(body).retrieve().body(Map.class);
    return new SavingsProduct(productId(response, "resourceId", "savingsProductId", "id"), name);
  }

  private static long productId(Map<?, ?> response, String... fields) {
    for (String field : fields) {
      if (response != null && response.get(field) instanceof Number id) return id.longValue();
    }
    throw new IllegalStateException("Fineract savings product id missing");
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


  public SavingsAccount accountDetails(long accountId) {
    return account(client.get().uri("/api/v1/savingsaccounts/{id}", accountId).retrieve().body(Map.class));
  }

  public SavingsLedgerView ledgerView(long accountId) {
    Map<?,?> account=client.get().uri(uri->uri.path("/api/v1/savingsaccounts/{id}")
        .queryParam("associations","transactions").build(accountId)).retrieve().body(Map.class);
    Map<?,?> product=client.get().uri("/api/v1/savingsproducts/{id}",account.get("savingsProductId"))
        .retrieve().body(Map.class);
    int rule=((Number)value(product.get("accountingRule"),"id")).intValue();
    Long control=optionalId(value(value(product.get("accountingMappings"),"savingsControlAccount"),"id"));
    if(rule==2&&control==null)throw new CoreReadModelException("Savings control GL mapping is missing");
    String currency=text(value(account.get("currency"),"code"));
    var legs=new java.util.ArrayList<TransferLeg>();
    if(account.get("transactions") instanceof List<?> rows)for(Object item:rows) {
      Map<?,?> row=(Map<?,?>)item;
      Long transferId=optionalId(value(row.get("transfer"),"id"));
      if(transferId==null||Boolean.TRUE.equals(row.get("reversed")))continue;
      var transaction=transaction(row,currency);
      legs.add(new TransferLeg(Long.parseLong(transaction.id()),transferId,transaction.amount(),transaction.currency(),transaction.type()));
    }
    return new SavingsLedgerView(rule,control,List.copyOf(legs));
  }

  public List<Cashier> cashiers() {
    List<?> body = client.get().uri("/api/v1/cashiers").retrieve().body(List.class);
    if (body == null) return List.of();
    return body.stream().map(item -> {
      Map<?, ?> row = (Map<?, ?>) item;
      return new Cashier(optionalId(row.get("id")), JSON.valueToTree(row));
    }).toList();
  }


  public SavingsAccount createSavingsAccount(long clientId, long productId, String currency, String externalId) {
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("clientId", clientId);
    body.put("productId", productId);
    body.put("externalId", externalId);
    body.put("nominalAnnualInterestRate", java.math.BigDecimal.ZERO);
    body.put("interestCompoundingPeriodType", 1);
    body.put("interestPostingPeriodType", 4);
    body.put("interestCalculationType", 1);
    body.put("interestCalculationDaysInYearType", 365);
    body.put("lockinPeriodFrequency", 0);
    body.put("lockinPeriodFrequencyType", 0);
    body.put("submittedOnDate", operations.postingDate().toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    Map<?, ?> response = client.post().uri("/api/v1/savingsaccounts").body(body).retrieve().body(Map.class);
    return new SavingsAccount(id(response, "id", "savingsId", "resourceId"), clientId,
        null, currency, null, null, null, null, null);
  }


  public SavingsAccount savingsByExternalId(String externalId) {
    try {
      return account(client.get().uri("/api/v1/savingsaccounts/external-id/{externalId}", externalId).retrieve().body(Map.class));
    } catch (org.springframework.web.client.RestClientResponseException error) {
      if (error.getStatusCode().value() == 404) return null;
      throw error;
    }
  }

  public void approveSavings(long accountId){lifecycleSavingsAction(accountId,"approve",Map.of("approvedOnDate",operations.postingDate().toString(),"dateFormat","yyyy-MM-dd","locale","en"));}
  public void activateSavings(long accountId){lifecycleSavingsAction(accountId,"activate",Map.of("activatedOnDate",operations.postingDate().toString(),"dateFormat","yyyy-MM-dd","locale","en"));}
  public SavingsDeposit depositSavings(long accountId,BigDecimal amount){return savingsTransaction(accountId,"deposit",amount);}

  private void lifecycleSavingsAction(long accountId,String action,Map<String,Object> payload){
    client.post().uri(uri->uri.path("/api/v1/savingsaccounts/{id}").queryParam("command",action).build(accountId)).body(payload).retrieve().toBodilessEntity();
  }

  private SavingsDeposit savingsTransaction(long accountId,String action,BigDecimal amount){
    Map<String,Object> payload=Map.of("transactionAmount",amount,"transactionDate",operations.postingDate().toString(),"dateFormat","yyyy-MM-dd","locale","en","paymentTypeId",1);
    Map<?, ?> response = client.post().uri(uri->uri.path("/api/v1/savingsaccounts/{id}/transactions").queryParam("command",action).build(accountId)).body(payload).retrieve().body(Map.class);
    return new SavingsDeposit(accountId, optionalId(first(value(response, "resourceId"), value(response, "transactionId"))));
  }

  public List<SavingsTransaction> savingsTransactions(long accountId,String fromDate,String toDate,String accountCurrency){
    Object body;
    try {
      body = client.get().uri(uri -> {
        var builder = uri.path("/api/v1/savingsaccounts/{id}/transactions");
        if (fromDate != null && !fromDate.isBlank()) builder.queryParam("fromDate", fromDate);
        if (toDate != null && !toDate.isBlank()) builder.queryParam("toDate", toDate);
        return builder.build(accountId);
      }).retrieve().body(Object.class);
    } catch (org.springframework.web.client.RestClientResponseException error) {
      if (error.getStatusCode().value() != 400 && error.getStatusCode().value() != 404
          && error.getStatusCode().value() != 405) throw error;
      body = client.get().uri(uri -> uri.path("/api/v1/savingsaccounts/{id}")
          .queryParam("associations", "transactions").build(accountId)).retrieve().body(Object.class);
    }
    Object entries = body instanceof Map<?,?> map ? map.get("transactions") : body;
    if (!(entries instanceof List<?>) && body instanceof Map<?,?> map) entries = map.get("content");
    if (!(entries instanceof List<?> list)) return List.of();
    return list.stream().filter(x->x instanceof Map<?,?>).map(x->transaction((Map<?, ?>) x, accountCurrency)).toList();
  }

  static SavingsAccount account(Map<?, ?> row) {
    if (row == null) throw new CoreReadModelException("Core account is missing");
    Object summary = row.get("summary");
    Object currency = first(row.get("currencyCode"), row.get("currency"));
    if (currency instanceof Map<?, ?> value) currency = value.get("code");
    Object status = row.get("status");
    Object timeline = row.get("timeline");
    return new SavingsAccount(id(row, "id", "accountId", "savingsAccountId"), optionalId(row.get("clientId")),
        text(first(row.get("accountNo"), row.get("accountNumber"))), text(currency),
        money(first(row.get("accountBalance"), row.get("balance"), value(summary, "accountBalance"))),
        text(first(row.get("productName"), value(row.get("depositType"), "value"))),
        text(first(value(status, "value"), status instanceof Map<?, ?> ? null : status)),
        text(first(value(status, "code"), status instanceof Map<?, ?> ? null : status)),
        date(first(value(timeline, "activatedOnDate"), value(timeline, "submittedOnDate"))));
  }

  static SavingsTransaction transaction(Map<?, ?> row, String accountCurrency) {
    Object type = row.get("transactionType");
    String description = text(value(type, "value"));
    String direction;
    if (Boolean.TRUE.equals(value(type, "withdrawal"))) direction = "DEBIT";
    else if (Boolean.TRUE.equals(value(type, "deposit"))) direction = "CREDIT";
    else direction = transactionDirection(description);
    Object currency = row.get("currency");
    String transactionDate = transactionDate(first(row.get("date"), row.get("submittedOnDate")));
    return new SavingsTransaction(text(row.get("id")), transactionDate,
        direction, description, money(row.get("amount")),
        text(first(currency instanceof Map<?, ?> code ? code.get("code") : currency, accountCurrency)), money(row.get("runningBalance")),
        text(row.get("note")), Boolean.TRUE.equals(row.get("reversed")));
  }

  private static Object first(Object... values) {
    for (Object value : values) if (value != null) return value;
    return null;
  }
  private static Object value(Object source, String key) { return source instanceof Map<?, ?> map ? map.get(key) : null; }
  private static String text(Object value) { return value == null ? null : String.valueOf(value); }
  private static Long optionalId(Object value) { return value instanceof Number id ? id.longValue() : null; }
  private static long id(Map<?, ?> row, String... keys) {
    for (String key : keys) if (row != null && row.get(key) instanceof Number id) return id.longValue();
    throw new CoreReadModelException("Core account id is missing");
  }
  private static BigDecimal money(Object value) {
    if (value == null) return null;
    try { return new BigDecimal(String.valueOf(value)).setScale(2, RoundingMode.HALF_UP); }
    catch (NumberFormatException error) { throw new CoreReadModelException("Core money value is invalid"); }
  }
  private static String transactionDirection(String description) {
    if (description == null || description.isBlank()) throw new CoreReadModelException("Core transaction type description is missing");
    String value = description.toLowerCase(java.util.Locale.ROOT);
    if (java.util.Set.of("deposit", "interest posting", "dividend payout", "refund", "reject transfer", "withdraw transfer").contains(value)) return "CREDIT";
    if (java.util.Set.of("withdrawal", "withdrawal fee", "transfer", "fee deduction", "initiate transfer", "approve transfer", "overdraft interest", "withhold tax").contains(value)) return "DEBIT";
    throw new CoreReadModelException("Core transaction type is unsupported");
  }
  private static LocalDate date(Object value) {
    if (value instanceof List<?> parts && parts.size() >= 3)
      return LocalDate.of(((Number) parts.get(0)).intValue(), ((Number) parts.get(1)).intValue(), ((Number) parts.get(2)).intValue());
    return value == null ? null : LocalDate.parse(String.valueOf(value).substring(0, 10));
  }
  private static String transactionDate(Object value) {
    if (value == null) throw new CoreReadModelException("Core transaction date is missing");
    if (value instanceof String date && date.contains("T")) return date;
    LocalDate day = date(value);
    return day == null ? null : day.toString();
  }

}
