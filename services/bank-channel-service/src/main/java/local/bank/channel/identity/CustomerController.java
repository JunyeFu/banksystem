package local.bank.channel.identity;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import local.bank.channel.FineractAccountPort;
import local.bank.channel.FineractLoanPort;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class CustomerController {
  private final FineractAccountPort fineract;
  private final FineractLoanPort loans;
  private final CustomerIdentityQuery identity;
  public CustomerController(FineractAccountPort fineract, FineractLoanPort loans, CustomerIdentityQuery identity) {
    this.fineract = fineract; this.loans = loans; this.identity = identity;
  }

  @GetMapping("/api/customer/v1/accounts")
  public Map<String, Object> accounts(@AuthenticationPrincipal Jwt jwt) {
    return Map.of("items", fineract.clientAccounts(identity.linkedClient(jwt.getSubject())).stream().map(CustomerController::summary).toList());
  }

  @GetMapping("/api/customer/v1/accounts/{accountId}")
  public Map<String, Object> account(@AuthenticationPrincipal Jwt jwt, @PathVariable String accountId) {
    boolean owned = fineract.clientAccounts(identity.linkedClient(jwt.getSubject())).stream()
        .filter(a -> accountId.equals(String.valueOf(a.id())))
        .findFirst().isPresent();
    if (!owned) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account is not linked");

    long coreAccountId;
    try {
      coreAccountId = Long.parseLong(accountId);
    } catch (NumberFormatException exception) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account is not linked");
    }
    FineractAccountPort.SavingsAccount coreDetail = fineract.accountDetails(coreAccountId);
    Map<String, Object> detail = new LinkedHashMap<>(summary(coreDetail));
    detail.put("transactions", fineract.savingsTransactions(coreAccountId, null, null, coreDetail.currency()).stream()
        .limit(20)
        .map(CustomerController::transaction)
        .toList());
    return detail;
  }

  static Map<String, Object> summary(FineractAccountPort.SavingsAccount source) {
    String accountNumber = source.accountNumber();
    if (accountNumber == null || accountNumber.isBlank())
      throw new local.bank.channel.CoreReadModelException("Core account number is missing");
    String masked = accountNumber.length() <= 4 ? "****" : "****" + accountNumber.substring(accountNumber.length() - Math.min(4, accountNumber.length()));
    if (source.currency() == null || source.currency().isBlank())
      throw new local.bank.channel.CoreReadModelException("Core account currency is missing");
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("accountId", String.valueOf(source.id()));
    result.put("maskedAccountNumber", masked);
    result.put("currency", source.currency());
    if (source.balance() == null) throw new local.bank.channel.CoreReadModelException("Core account balance is missing");
    result.put("balance", source.balance().toPlainString());
    putIfPresent(result, "accountType", source.productName());
    putIfPresent(result, "status", source.status());
    if (source.openedOn() != null) result.put("openedOn", source.openedOn().toString());
    return result;
  }

  static Map<String, Object> transaction(FineractAccountPort.SavingsTransaction source) {
    return CustomerTransactionMapper.map(source);
  }

  private static void putIfPresent(Map<String, Object> target, String key, Object value) {
    if (value != null && !String.valueOf(value).isBlank()) target.put(key, String.valueOf(value));
  }

  private static String decimal(Object value) { return CustomerTransactionMapper.moneyText(value, "money value"); }

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
    var items = fineract.clientAccounts(identity.linkedClient(jwt.getSubject())).stream().map(account -> {
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
    return Map.of("items", loans.clientLoans(identity.linkedClient(jwt.getSubject())).stream().map(CustomerController::loanSummary).toList());
  }

  @GetMapping("/api/customer/v1/loans/{loanId}")
  public Map<String,Object> loan(@AuthenticationPrincipal Jwt jwt, @PathVariable String loanId) {
    FineractLoanPort.LoanAccount owned = loans.clientLoans(identity.linkedClient(jwt.getSubject())).stream()
        .filter(item -> loanId.equals(String.valueOf(item.id())))
        .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan is not linked"));
    long coreLoanId;
    try { coreLoanId = Long.parseLong(loanId); }
    catch (NumberFormatException exception) { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan is not linked"); }
    return loanDetail(loans.loanDetails(coreLoanId), owned);
  }

  private static String displayName(Jwt jwt) {
    String value = jwt.getClaimAsString("name");
    if (value == null || value.isBlank()) value = jwt.getClaimAsString("preferred_username");
    return value == null || value.isBlank() ? jwt.getSubject() : value;
  }

  static Map<String, Object> loanSummary(FineractLoanPort.LoanAccount source) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("loanId", String.valueOf(source.id()));
    result.put("loanProductName", source.productName() == null ? "贷款" : source.productName());
    result.put("principal", decimal(source.principal()));
    result.put("outstandingBalance", decimal(source.outstandingBalance()));
    if (source.currency() == null || source.currency().isBlank())
      throw new local.bank.channel.CoreReadModelException("Core loan currency is missing");
    result.put("currency", source.currency());
    result.put("status", source.status() == null ? "UNKNOWN" : source.status());
    return result;
  }

  static Map<String, Object> loanDetail(FineractLoanPort.LoanAccount source, FineractLoanPort.LoanAccount fallback) {
    FineractLoanPort.LoanAccount loan = source == null ? fallback : source.withFallback(fallback);
    Map<String, Object> result = new LinkedHashMap<>(loanSummary(loan));
    result.put("termMonths", loan.termMonths());
    putIfPresent(result, "interestRate", loan.interestRate());
    if (loan.startDate() != null) result.put("startDate", loan.startDate().toString());
    if (loan.endDate() != null) result.put("endDate", loan.endDate().toString());
    result.put("repaymentSchedule", loan.schedule().stream().map(CustomerController::installment).toList());
    return result;
  }

  static Map<String, Object> installment(FineractLoanPort.Installment source) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("period", source.period());
    result.put("dueDate", source.dueDate().toString());
    result.put("principalDue", decimal(source.principalDue()));
    result.put("interestDue", decimal(source.interestDue()));
    result.put("totalDue", decimal(source.totalDue()));
    result.put("status", source.paid() ? "PAID" : "DUE");
    return result;
  }
}
