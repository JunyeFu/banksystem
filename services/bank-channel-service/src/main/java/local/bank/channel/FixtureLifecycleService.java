package local.bank.channel;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import local.bank.channel.identity.CustomerIdentityRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Profile("test-support")
@Service
public class FixtureLifecycleService {
  private record SeedResult(long id, String action) { }

  private final FixtureCatalog catalog;
  private final FineractAccountPort fineract;
  private final FineractCustomerPort customers;
  private final FineractLoanPort loans;
  private final CustomerIdentityRepository identities;

  public FixtureLifecycleService(FixtureCatalog catalog, FineractAccountPort fineract,
      FineractCustomerPort customers, FineractLoanPort loans, CustomerIdentityRepository identities) {
    this.catalog = catalog;
    this.fineract = fineract;
    this.customers = customers;
    this.loans = loans;
    this.identities = identities;
  }

  public Map<String, Object> seed() {
    Map<String, Object> savingsFixture = catalog.require("product.demo.primarySavings");
    Map<String, Object> loanFixture = catalog.require("product.demo.basicLoan");
    Map<String, Object> aliceFixture = catalog.require("customer.alice");
    Map<String, Object> bobFixture = catalog.require("customer.bob");
    Map<String, Object> aliceAccountFixture = catalog.require("account.alice.primarySavings");
    Map<String, Object> bobAccountFixture = catalog.require("account.bob.primarySavings");

    SeedResult savings = savingsProduct(savingsFixture);
    SeedResult loan = loanProduct(loanFixture);
    SeedResult alice = client(aliceFixture);
    SeedResult bob = client(bobFixture);
    SeedResult aliceAccount = savingsAccount(alice.id(), savings.id(), aliceAccountFixture);
    SeedResult bobAccount = savingsAccount(bob.id(), savings.id(), bobAccountFixture);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("product.demo.primarySavings", Map.of("fineractProductId", savings.id(), "action", savings.action()));
    result.put("product.demo.basicLoan", Map.of("fineractProductId", loan.id(), "action", loan.action()));
    result.put("customer.alice", Map.of("subject", fixtureSubject(aliceFixture), "fineractClientId", alice.id(), "action", alice.action()));
    result.put("customer.bob", Map.of("subject", fixtureSubject(bobFixture), "fineractClientId", bob.id(), "action", bob.action()));
    result.put("account.alice.primarySavings", Map.of("accountId", aliceAccount.id(), "currency", requiredText(aliceAccountFixture, "currency"), "action", aliceAccount.action()));
    result.put("account.bob.primarySavings", Map.of("accountId", bobAccount.id(), "currency", requiredText(bobAccountFixture, "currency"), "action", bobAccount.action()));
    result.put("status", "SEEDED");
    return result;
  }

  @Transactional
  public Map<String, Object> reset() {
    int mappings = identities.deleteSubjects(
        fixtureSubject(catalog.require("customer.alice")), fixtureSubject(catalog.require("customer.bob")));
    return Map.of("status", "RESET", "fixtureMappingsRemoved", mappings);
  }

  private SeedResult client(Map<String, Object> fixture) {
    String externalId = requiredText(fixture, "externalId");
    FineractCustomerPort.ClientRef existing = customers.clientByExternalId(externalId);
    boolean created = existing == null;
    FineractCustomerPort.ClientRef resource = created
        ? customers.createClient(requiredText(fixture, "displayName"), null, externalId) : existing;
    long id = resource.id();
    identities.bind(fixtureSubject(fixture),id);
    return new SeedResult(id, created ? "CREATED" : "REUSED");
  }

  private SeedResult savingsProduct(Map<String, Object> fixture) {
    String name = requiredText(fixture, "name");
    String currency = requiredText(fixture, "currency");
    fineract.ensureCurrencyEnabled(currency);
    fineract.ensureTransferAccounting();
    List<FineractAccountPort.SavingsProduct> matches = fineract.savingsProducts().stream()
        .filter(product -> name.equals(product.name())).toList();
    if (matches.size() > 1) throw new IllegalStateException("Fixture savings product is ambiguous");
    if (matches.size() == 1) return new SeedResult(matches.get(0).id(), "REUSED");
    FineractAccountPort.SavingsProduct created = fineract.createSavingsProduct(name, requiredText(fixture, "shortName"), currency);
    return new SeedResult(created.id(), "CREATED");
  }

  private SeedResult loanProduct(Map<String, Object> fixture) {
    String name = requiredText(fixture, "name");
    List<FineractLoanPort.LoanProduct> matches = loans.loanProducts().stream()
        .filter(product -> name.equals(product.name())).toList();
    if (matches.size() > 1) throw new IllegalStateException("Fixture loan product is ambiguous");
    if (matches.size() == 1) return new SeedResult(matches.get(0).id(), "REUSED");
    FineractLoanPort.LoanProduct created = loans.createLoanProduct(name, requiredText(fixture, "shortName"),
        requiredText(fixture, "currency"));
    return new SeedResult(created.id(), "CREATED");
  }

  private SeedResult savingsAccount(long clientId, long productId, Map<String, Object> fixture) {
    String externalId = requiredText(fixture, "externalId");
    FineractAccountPort.SavingsAccount existing = fineract.savingsByExternalId(externalId);
    boolean created = existing == null;
    FineractAccountPort.SavingsAccount resource = created
        ? fineract.createSavingsAccount(clientId, productId, requiredText(fixture, "currency"), externalId) : existing;
    long id = resource.id();
    if (!created && !Long.valueOf(clientId).equals(resource.clientId())) {
      throw new IllegalStateException("Fixture savings account belongs to another client");
    }
    ensureActiveSavings(id, created ? fineract.accountDetails(id) : resource);
    if (created) fineract.depositSavings(id, new BigDecimal(requiredText(fixture, "initialBalance")));
    return new SeedResult(id, created ? "CREATED" : "REUSED");
  }

  private void ensureActiveSavings(long id, FineractAccountPort.SavingsAccount resource) {
    String normalized = String.valueOf(resource.statusCode()).toLowerCase(java.util.Locale.ROOT);
    if (normalized.contains("active")) return;
    if (normalized.contains("submitted")) {
      fineract.approveSavings(id);
      fineract.activateSavings(id);
      return;
    }
    if (normalized.contains("approved")) {
      fineract.activateSavings(id);
      return;
    }
    throw new IllegalStateException("Unsupported savings account status");
  }

  public static String fixtureSubject(Map<String, Object> fixture) {
    return requiredText(fixture, "fixtureSubject");
  }

  public static String requiredText(Map<String, Object> fixture, String field) {
    Object value = fixture.get(field);
    if (value == null || String.valueOf(value).isBlank()) throw new IllegalStateException("Fixture field missing: " + field);
    return String.valueOf(value);
  }

  private static long requiredId(Map<String, Object> resource, String... fields) {
    for (String field : fields) {
      Object value = resource == null ? null : resource.get(field);
      if (value instanceof Number number) return number.longValue();
    }
    throw new IllegalStateException("Fineract resource id missing");
  }
}
