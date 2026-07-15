package local.bank.channel.identity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAdapter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@RestController
public class CustomerController {
  private final FineractAdapter fineract;
  private final JdbcTemplate jdbc;
  public CustomerController(FineractAdapter fineract, JdbcTemplate jdbc) { this.fineract = fineract; this.jdbc = jdbc; }

  @GetMapping("/api/customer/v1/accounts")
  public Map<String, Object> accounts(@AuthenticationPrincipal Jwt jwt) {
    return Map.of("items", fineract.clientAccounts(linkedClient(jwt.getSubject())).stream().map(CustomerController::summary).toList());
  }

  @GetMapping("/api/customer/v1/accounts/{accountId}")
  public Map<String, Object> account(@AuthenticationPrincipal Jwt jwt, @PathVariable String accountId) {
    boolean owned = fineract.clientAccounts(linkedClient(jwt.getSubject())).stream()
        .filter(a -> accountId.equals(String.valueOf(a.getOrDefault("id", a.get("accountId")))))
        .findFirst().isPresent();
    if (!owned) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account is not linked");

    long coreAccountId;
    try {
      coreAccountId = Long.parseLong(accountId);
    } catch (NumberFormatException exception) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account is not linked");
    }
    Map<String, Object> detail = new LinkedHashMap<>(summary(fineract.accountDetails(coreAccountId)));
    detail.put("transactions", fineract.savingsTransactions(coreAccountId, null, null).stream()
        .limit(20)
        .map(CustomerController::transaction)
        .toList());
    return detail;
  }

  private long linkedClient(String subject) {
    List<Long> ids = jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject = ?", (rs, n) -> rs.getLong(1), subject);
    if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer identity is not linked");
    return ids.get(0);
  }
  public long linkedClientForStatement(String subject) { return linkedClient(subject); }

  static Map<String, Object> summary(Map<String, Object> source) {
    String raw = String.valueOf(source.getOrDefault("accountNo", source.getOrDefault("accountNumber", "")));
    String masked = raw.length() <= 4 ? "****" : "****" + raw.substring(raw.length() - Math.min(4, raw.length()));
    Object summary = source.get("summary");
    Object balance = source.getOrDefault("accountBalance", source.getOrDefault("balance", valueFrom(summary, "accountBalance", "0.00")));
    Object currency = source.getOrDefault("currency", source.getOrDefault("currencyCode", ""));
    if (currency instanceof Map<?, ?> map) { Object code = map.get("code"); currency = code == null ? "" : code; }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("accountId", String.valueOf(source.getOrDefault("id", source.getOrDefault("accountId", ""))));
    result.put("maskedAccountNumber", masked);
    result.put("currency", String.valueOf(currency));
    result.put("balance", decimal(balance));
    putIfPresent(result, "accountType", source.getOrDefault("productName", valueFrom(source.get("depositType"), "value", null)));
    putIfPresent(result, "status", valueFrom(source.get("status"), "value", source.get("status")));
    Object timeline = source.get("timeline");
    String openedOn = date(valueFrom(timeline, "activatedOnDate", valueFrom(timeline, "submittedOnDate", null)));
    if (openedOn != null) result.put("openedOn", openedOn);
    return result;
  }

  static Map<String, Object> transaction(Map<String, Object> source) {
    Object type = source.get("transactionType");
    boolean debit = Boolean.TRUE.equals(valueFrom(type, "withdrawal", false))
        || String.valueOf(valueFrom(type, "value", "")).toLowerCase().contains("withdraw");
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("transactionId", String.valueOf(source.getOrDefault("id", "")));
    result.put("transactionDate", timestamp(source.getOrDefault("date", source.get("submittedOnDate"))));
    result.put("transactionType", debit ? "DEBIT" : "CREDIT");
    result.put("description", String.valueOf(valueFrom(type, "value", debit ? "转出" : "转入")));
    putIfPresent(result, "counterparty", source.get("note"));
    result.put("amount", decimal(source.getOrDefault("amount", "0.00")));
    Object currency = source.get("currency");
    result.put("currency", String.valueOf(valueFrom(currency, "code", currency == null ? "CNY" : currency)));
    if (source.get("runningBalance") != null) result.put("runningBalance", decimal(source.get("runningBalance")));
    return result;
  }

  private static Object valueFrom(Object source, String key, Object fallback) {
    if (source instanceof Map<?, ?> map && map.get(key) != null) return map.get(key);
    return fallback;
  }

  private static void putIfPresent(Map<String, Object> target, String key, Object value) {
    if (value != null && !String.valueOf(value).isBlank()) target.put(key, String.valueOf(value));
  }

  private static String decimal(Object value) {
    try { return new BigDecimal(String.valueOf(value)).abs().setScale(2, RoundingMode.HALF_UP).toPlainString(); }
    catch (NumberFormatException exception) { return "0.00"; }
  }

  private static String date(Object value) {
    if (value instanceof List<?> parts && parts.size() >= 3) {
      return LocalDate.of(((Number) parts.get(0)).intValue(), ((Number) parts.get(1)).intValue(), ((Number) parts.get(2)).intValue()).toString();
    }
    if (value == null || String.valueOf(value).isBlank()) return null;
    return String.valueOf(value);
  }

  private static String timestamp(Object value) {
    String day = date(value);
    if (day == null) return "1970-01-01T00:00:00Z";
    return day.contains("T") ? day : day + "T00:00:00Z";
  }

  @GetMapping("/api/customer/v1/customers/me")
  public Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
    String displayName = jwt.getClaimAsString("name");
    if (displayName == null || displayName.isBlank()) displayName = jwt.getClaimAsString("preferred_username");
    if (displayName == null || displayName.isBlank()) displayName = jwt.getSubject();
    return Map.of("customerId", jwt.getSubject(), "displayName", displayName);
  }

  @GetMapping("/api/customer/v1/profile")
  public Map<String, Object> profile(@AuthenticationPrincipal Jwt jwt) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("customerId", jwt.getSubject());
    result.put("displayName", displayName(jwt));
    putIfPresent(result, "email", jwt.getClaimAsString("email"));
    putIfPresent(result, "phone", jwt.getClaimAsString("phone_number"));
    return result;
  }

  @GetMapping("/api/customer/v1/security/settings")
  public Map<String, Object> securitySettings(@AuthenticationPrincipal Jwt jwt) {
    List<String> authenticationMethods = jwt.getClaimAsStringList("amr");
    boolean mfaEnabled = authenticationMethods != null && authenticationMethods.stream()
        .anyMatch(method -> List.of("mfa", "otp", "totp").contains(method.toLowerCase()));
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("mfaEnabled", mfaEnabled);
    result.put("loginNotificationsEnabled", true);
    if (mfaEnabled) result.put("mfaMethod", "动态口令");
    if (jwt.getIssuedAt() != null) result.put("lastLoginAt", jwt.getIssuedAt().toString());
    return result;
  }

  @GetMapping("/api/customer/v1/documents")
  public Map<String, Object> documents(@AuthenticationPrincipal Jwt jwt) {
    var items = fineract.clientAccounts(linkedClient(jwt.getSubject())).stream().map(account -> {
      Map<String, Object> summary = summary(account);
      String accountId = String.valueOf(summary.get("accountId"));
      Map<String, Object> document = new LinkedHashMap<>();
      document.put("documentId", "statement-" + accountId);
      document.put("documentType", "账户对账单");
      document.put("description", String.valueOf(summary.get("maskedAccountNumber")) + " 最新账户对账单");
      document.put("createdDate", LocalDate.now().toString());
      document.put("downloadUrl", "/api/customer/v1/statements?accountId=" + accountId + "&format=pdf");
      return document;
    }).toList();
    return Map.of("items", items);
  }

  @GetMapping("/api/customer/v1/loans")
  public Map<String,Object> loans(@AuthenticationPrincipal Jwt jwt){
    return Map.of("items", fineract.clientLoans(linkedClient(jwt.getSubject())).stream().map(CustomerController::loanSummary).toList());
  }

  @GetMapping("/api/customer/v1/loans/{loanId}")
  public Map<String,Object> loan(@AuthenticationPrincipal Jwt jwt, @PathVariable String loanId) {
    Map<String, Object> owned = fineract.clientLoans(linkedClient(jwt.getSubject())).stream()
        .filter(item -> loanId.equals(String.valueOf(item.getOrDefault("id", item.get("loanId")))))
        .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan is not linked"));
    long coreLoanId;
    try { coreLoanId = Long.parseLong(loanId); }
    catch (NumberFormatException exception) { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan is not linked"); }
    return loanDetail(fineract.loanDetails(coreLoanId), owned);
  }

  private static String displayName(Jwt jwt) {
    String value = jwt.getClaimAsString("name");
    if (value == null || value.isBlank()) value = jwt.getClaimAsString("preferred_username");
    return value == null || value.isBlank() ? jwt.getSubject() : value;
  }

  static Map<String, Object> loanSummary(Map<String, Object> source) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("loanId", String.valueOf(source.getOrDefault("id", source.getOrDefault("loanId", ""))));
    result.put("loanProductName", String.valueOf(source.getOrDefault("loanProductName", source.getOrDefault("productName", "贷款"))));
    result.put("principal", decimal(source.getOrDefault("principal", "0.00")));
    Object summary = source.get("summary");
    result.put("outstandingBalance", decimal(source.getOrDefault("loanBalanceOutstanding", valueFrom(summary, "totalOutstanding", "0.00"))));
    Object currency = source.get("currency");
    result.put("currency", String.valueOf(valueFrom(currency, "code", source.getOrDefault("currencyCode", "CNY"))));
    result.put("status", String.valueOf(valueFrom(source.get("status"), "value", source.getOrDefault("status", "UNKNOWN"))));
    return result;
  }

  static Map<String, Object> loanDetail(Map<String, Object> source, Map<String, Object> fallback) {
    Map<String, Object> result = new LinkedHashMap<>(loanSummary(source.isEmpty() ? fallback : source));
    Object term = source.getOrDefault("termFrequency", source.getOrDefault("numberOfRepayments", 0));
    result.put("termMonths", term instanceof Number ? ((Number) term).intValue() : 0);
    putIfPresent(result, "interestRate", source.getOrDefault("interestRatePerPeriod", source.get("annualInterestRate")));
    Object timeline = source.get("timeline");
    String startDate = date(valueFrom(timeline, "actualDisbursementDate", valueFrom(timeline, "submittedOnDate", null)));
    String endDate = date(valueFrom(timeline, "expectedMaturityDate", null));
    if (startDate != null) result.put("startDate", startDate);
    if (endDate != null) result.put("endDate", endDate);
    Object schedule = valueFrom(source.get("repaymentSchedule"), "periods", List.of());
    if (schedule instanceof List<?> periods) {
      result.put("repaymentSchedule", periods.stream().filter(Map.class::isInstance).limit(24)
          .map(Map.class::cast).filter(CustomerController::validInstallment).map(CustomerController::installment).toList());
    } else result.put("repaymentSchedule", List.of());
    return result;
  }

  static Map<String, Object> installment(Map<?, ?> source) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("period", source.get("period") == null ? 1 : source.get("period"));
    result.put("dueDate", date(source.get("dueDate")));
    result.put("principalDue", decimal(source.get("principalDue") == null ? "0.00" : source.get("principalDue")));
    result.put("interestDue", decimal(source.get("interestDue") == null ? "0.00" : source.get("interestDue")));
    result.put("totalDue", decimal(source.get("totalDueForPeriod") == null ? "0.00" : source.get("totalDueForPeriod")));
    result.put("status", Boolean.TRUE.equals(source.get("complete")) ? "PAID" : "DUE");
    return result;
  }

  private static boolean validInstallment(Map<?, ?> source) {
    return source.get("period") instanceof Number period && period.intValue() >= 1 && date(source.get("dueDate")) != null;
  }
}
