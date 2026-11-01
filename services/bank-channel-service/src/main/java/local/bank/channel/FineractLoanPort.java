package local.bank.channel;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FineractLoanPort {
  public record LoanProduct(long id, String name) { }
  public record LoanSubmissionCommand(long clientId, long productId, BigDecimal principal,
                                      int termMonths, BigDecimal annualInterestRate, LocalDate postingDate,
                                      String repaymentMethod) { }
  public record LoanSubmission(long loanId) { }
  public record LoanActionResult(JsonNode corePayload) { }
  public record Installment(int period, LocalDate dueDate, BigDecimal principalDue,
                            BigDecimal interestDue, BigDecimal totalDue, boolean paid) { }
  public record LoanAccount(long id, String productName, BigDecimal principal,
                            BigDecimal outstandingBalance, String currency, String status,
                            int termMonths, String interestRate, LocalDate startDate,
                            LocalDate endDate, List<Installment> schedule, JsonNode corePayload) {
    public LoanAccount withFallback(LoanAccount fallback) {
      return new LoanAccount(id, productName == null ? fallback.productName : productName,
          principal == null ? fallback.principal : principal,
          outstandingBalance == null ? fallback.outstandingBalance : outstandingBalance,
          currency == null ? fallback.currency : currency,
          status == null ? fallback.status : status,
          termMonths == 0 ? fallback.termMonths : termMonths,
          interestRate == null ? fallback.interestRate : interestRate,
          startDate == null ? fallback.startDate : startDate,
          endDate == null ? fallback.endDate : endDate, schedule, corePayload);
    }
  }
  private static final ObjectMapper JSON = new ObjectMapper();
  private final RestClient client;
  public FineractLoanPort(FineractTransport transport) { this.client = transport.client(); }

  public List<LoanProduct> loanProducts() {
    List<?> body = client.get().uri("/api/v1/loanproducts").retrieve().body(List.class);
    if (body == null) return List.of();
    return body.stream().map(item -> {
      Map<?, ?> product = (Map<?, ?>) item;
      return new LoanProduct(((Number) product.get("id")).longValue(), String.valueOf(product.get("name")));
    }).toList();
  }

  public LoanProduct createLoanProduct(String name, String shortName, String currency) {
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("name", name);
    body.put("shortName", shortName);
    body.put("description", "Synthetic open-source demo loan product");
    body.put("currencyCode", currency);
    body.put("digitsAfterDecimal", 2);
    body.put("inMultiplesOf", 1);
    body.put("principal", 1000);
    body.put("minPrincipal", 100);
    body.put("maxPrincipal", 1000000);
    body.put("numberOfRepayments", 12);
    body.put("minNumberOfRepayments", 1);
    body.put("maxNumberOfRepayments", 480);
    body.put("repaymentEvery", 1);
    body.put("repaymentFrequencyType", 2);
    body.put("interestRatePerPeriod", new java.math.BigDecimal("0.3625"));
    body.put("interestRateFrequencyType", 2);
    body.put("amortizationType", 1);
    body.put("interestType", 0);
    body.put("interestCalculationPeriodType", 1);
    body.put("daysInYearType", 1);
    body.put("daysInMonthType", 1);
    body.put("isInterestRecalculationEnabled", false);
    body.put("transactionProcessingStrategyCode", "mifos-standard-strategy");
    body.put("accountingRule", 1);
    body.put("locale", "en");
    Map<?, ?> response = client.post().uri("/api/v1/loanproducts").body(body).retrieve().body(Map.class);
    for (String field : new String[] {"resourceId", "loanProductId", "id"}) {
      if (response != null && response.get(field) instanceof Number id) return new LoanProduct(id.longValue(), name);
    }
    throw new IllegalStateException("Fineract loan product id missing");
  }


  public List<LoanAccount> clientLoans(long clientId) {
    Map<?, ?> body=client.get().uri("/api/v1/clients/{id}/accounts",clientId).retrieve().body(Map.class);
    if(body==null||!(body.get("loanAccounts") instanceof List<?> list))return List.of();
    return list.stream().filter(x->x instanceof Map<?,?>).map(x->loan((Map<?, ?>)x)).toList();
  }

  public LoanSubmission submitLoan(LoanSubmissionCommand command, String idempotencyKey){
    Map<String,Object> body = new java.util.LinkedHashMap<>();
    body.put("clientId", command.clientId());
    body.put("externalId", loanExternalId(idempotencyKey));
    body.put("productId", command.productId());
    body.put("principal", command.principal());
    body.put("loanTermFrequency", command.termMonths());
    body.put("loanTermFrequencyType", 2);
    body.put("loanType", "individual");
    body.put("numberOfRepayments", command.termMonths());
    body.put("repaymentEvery", 1);
    body.put("repaymentFrequencyType", 2);
    body.put("interestRatePerPeriod", command.annualInterestRate().divide(new BigDecimal("12"), 8, RoundingMode.HALF_UP));
    body.put("interestRateFrequencyType", 2);
    body.put("amortizationType", switch(command.repaymentMethod()) {
      case "EQUAL_PRINCIPAL" -> 0;
      case "EQUAL_INSTALLMENTS" -> 1;
      default -> throw new IllegalArgumentException("Unsupported repayment method");
    });
    body.put("interestType", 0);
    body.put("interestCalculationPeriodType", 1);
    body.put("transactionProcessingStrategyCode", "mifos-standard-strategy");
    body.put("expectedDisbursementDate", command.postingDate().toString());
    body.put("submittedOnDate", command.postingDate().toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    String coreKey=FineractTransport.coreIdempotencyKey(idempotencyKey);
    Map<?, ?> response = client.post().uri("/api/v1/loans")
        .header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey)
        .body(body).retrieve().body(Map.class);
    return new LoanSubmission(id(response, "loanId", "resourceId"));
  }

  public java.util.Optional<LoanSubmission> findSubmittedLoan(long clientId,String key,LoanSubmissionCommand expected) {
    var matches=clientLoans(clientId).stream().map(account->loanDetails(account.id()))
        .filter(account->loanExternalId(key).equals(account.corePayload().path("externalId").asText())).toList();
    if(matches.size()>1) throw new CoreReadModelException("Core loan external id is not unique");
    if(matches.isEmpty()) return java.util.Optional.empty();
    var account=matches.getFirst();
    var payload=account.corePayload();
    int amortization=expected.repaymentMethod().equals("EQUAL_PRINCIPAL")?0:1;
    if(account.principal()==null||expected.principal().compareTo(account.principal())!=0
        ||payload.path("clientId").asLong()!=expected.clientId()
        ||payload.path("loanProductId").asLong()!=expected.productId()
        ||account.termMonths()!=expected.termMonths()
        ||payload.path("amortizationType").path("id").asInt(-1)!=amortization
        ||payload.path("interestRateFrequencyType").path("id").asInt(-1)!=2
        ||!payload.hasNonNull("interestRatePerPeriod")
        ||expected.annualInterestRate().divide(new BigDecimal("12"),8,RoundingMode.HALF_UP)
            .compareTo(payload.path("interestRatePerPeriod").decimalValue())!=0)
      throw new CoreReadModelException("Core loan terms do not match approved application");
    return java.util.Optional.of(new LoanSubmission(account.id()));
  }
  private static String loanExternalId(String key) {
    return "hz-loan-"+java.util.UUID.nameUUIDFromBytes(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  public LoanActionResult loanCommand(long loanId, String command, Map<String,Object> body, String idempotencyKey){
    if(!java.util.Set.of("approve","reject","withdrawnByApplicant","disburse","undodisbursal","undoapproval").contains(command)) throw new IllegalArgumentException("Unsupported loan command");
    String coreKey=FineractTransport.coreIdempotencyKey(idempotencyKey);
    JsonNode response = client.post().uri(uri->uri.path("/api/v1/loans/{id}").queryParam("command",command).build(loanId)).header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey).body(body==null?Map.of():body).retrieve().body(JsonNode.class);
    return new LoanActionResult(response);
  }

  public LoanAccount loanDetails(long loanId){
    Map<?, ?> response = client.get().uri(uri->uri.path("/api/v1/loans/{id}").queryParam("associations","all").build(loanId)).retrieve().body(Map.class);
    if (response == null || response.isEmpty())
      return new LoanAccount(loanId, null, null, null, null, null, 0, null,
          null, null, List.of(), JSON.valueToTree(Map.of()));
    return loan(response);
  }

  public LoanActionResult loanTransaction(long loanId, String command, BigDecimal amount,
                                          LocalDate postingDate, String idempotencyKey){
    if(!java.util.Set.of("repayment","foreclosure","close","writeoff","undowriteoff").contains(command)) throw new IllegalArgumentException("Unsupported loan transaction");
    Map<String,Object> body = new java.util.LinkedHashMap<>();
    if (amount != null) body.put("transactionAmount", amount);
    body.put("transactionDate", postingDate.toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    if(command.equals("repayment")) body.put("externalId", transactionExternalId(idempotencyKey));
    String coreKey=FineractTransport.coreIdempotencyKey(idempotencyKey);
    JsonNode response = client.post().uri(uri->uri.path("/api/v1/loans/{id}/transactions").queryParam("command",command).build(loanId)).header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey).body(body).retrieve().body(JsonNode.class);
    return new LoanActionResult(response);
  }

  public java.util.Optional<LoanActionResult> findTransaction(long loanId,String command,BigDecimal amount,
                                                              LocalDate postingDate,String key) {
    LoanAccount account=loanDetails(loanId);
    if(command.equals("close")) {
      return account.corePayload().path("status").path("closedObligationsMet").asBoolean()
          ? java.util.Optional.of(new LoanActionResult(account.corePayload())) : java.util.Optional.empty();
    }
    var matches=new java.util.ArrayList<JsonNode>();
    for(var transaction:account.corePayload().path("transactions"))
      if(transactionExternalId(key).equals(transaction.path("externalId").asText()))matches.add(transaction);
    if(matches.isEmpty())return java.util.Optional.empty();
    if(matches.size()!=1)throw new CoreReadModelException("Core repayment external id is ambiguous");
    var transaction=matches.getFirst();
    var date=transaction.path("date");
    if(transaction.path("manuallyReversed").asBoolean() || !transaction.path("type").path("repayment").asBoolean()
        ||!transaction.hasNonNull("amount") || amount.compareTo(transaction.path("amount").decimalValue())!=0
        ||!date.isArray() ||date.size()!=3
        ||!postingDate.equals(LocalDate.of(date.get(0).asInt(),date.get(1).asInt(),date.get(2).asInt())))
      throw new CoreReadModelException("Core repayment facts differ from request");
    return java.util.Optional.of(new LoanActionResult(JSON.valueToTree(Map.of("loanId",loanId,"resourceId",transaction.path("id").asLong()))));
  }

  private static String transactionExternalId(String key) {
    return "hz-payment-"+java.util.UUID.nameUUIDFromBytes(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  static LoanAccount loan(Map<?, ?> row) {
    if (row == null) throw new CoreReadModelException("Core loan is missing");
    Object timeline = row.get("timeline");
    Object schedule = value(row.get("repaymentSchedule"), "periods");
    List<Installment> installments = schedule instanceof List<?> list ? list.stream()
        .filter(item -> item instanceof Map<?, ?>)
        .map(item -> (Map<?, ?>) item)
        .filter(item -> item.get("period") instanceof Number period && period.intValue() >= 1 && date(item.get("dueDate")) != null)
        .map(item -> new Installment(((Number)item.get("period")).intValue(), date(item.get("dueDate")),
            money(item.get("principalDue")), money(item.get("interestDue")),
            money(item.get("totalDueForPeriod")), Boolean.TRUE.equals(item.get("complete"))))
        .toList() : List.of();
    Object currency = row.get("currency");
    Object status = row.get("status");
    Object term = first(row.get("termFrequency"), row.get("numberOfRepayments"));
    return new LoanAccount(id(row, "id", "loanId"),
        text(first(row.get("loanProductName"), row.get("productName"))), money(row.get("principal")),
        money(first(row.get("loanBalanceOutstanding"), value(row.get("summary"), "totalOutstanding"))),
        text(first(value(currency, "code"), row.get("currencyCode"))),
        text(first(value(status, "value"), status instanceof Map<?, ?> ? null : status)),
        term instanceof Number number ? number.intValue() : 0,
        annualRate(row),
        date(first(value(timeline, "actualDisbursementDate"), value(timeline, "submittedOnDate"))),
        date(value(timeline, "expectedMaturityDate")), installments, JSON.valueToTree(row));
  }

  private static String annualRate(Map<?, ?> row) {
    if(row.get("annualInterestRate") != null) return text(row.get("annualInterestRate"));
    if(row.get("interestRatePerPeriod") == null) return null;
    Object frequency=value(row.get("interestRateFrequencyType"), "id");
    if(frequency == null) frequency=row.get("interestRateFrequencyType");
    if(!(frequency instanceof Number number)) throw new CoreReadModelException("Core interest rate frequency is missing");
    BigDecimal rate=new BigDecimal(String.valueOf(row.get("interestRatePerPeriod")));
    return switch(number.intValue()) {
      case 2 -> rate.multiply(new BigDecimal("12")).stripTrailingZeros().toPlainString();
      case 3 -> rate.stripTrailingZeros().toPlainString();
      default -> throw new CoreReadModelException("Unsupported core interest rate frequency");
    };
  }
  private static Object first(Object... values) { for (Object value : values) if (value != null) return value; return null; }
  private static Object value(Object source, String key) { return source instanceof Map<?, ?> map ? map.get(key) : null; }
  private static String text(Object value) { return value == null ? null : String.valueOf(value); }
  private static BigDecimal money(Object value) { return value == null ? null : new BigDecimal(String.valueOf(value)).setScale(2, RoundingMode.HALF_UP); }
  private static long id(Map<?, ?> row, String... keys) {
    for (String key : keys) if (row != null && row.get(key) instanceof Number number) return number.longValue();
    throw new CoreReadModelException("Core loan id is missing");
  }
  private static LocalDate date(Object value) {
    if (value instanceof List<?> parts && parts.size() >= 3)
      return LocalDate.of(((Number)parts.get(0)).intValue(), ((Number)parts.get(1)).intValue(), ((Number)parts.get(2)).intValue());
    return value == null ? null : LocalDate.parse(String.valueOf(value).substring(0, 10));
  }

}
