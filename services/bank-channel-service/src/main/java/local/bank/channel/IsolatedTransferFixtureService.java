package local.bank.channel;

import java.math.BigDecimal;
import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonFormat;
import local.bank.channel.identity.CustomerIdentityRepository;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.beneficiaries.BeneficiaryTokenService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Test-only synthetic accounts. Existing money is never replenished or reset. */
@Profile("test-support")
@Service
public class IsolatedTransferFixtureService {
  public record Result(String status, UUID fixtureId, UUID subject, long sourceClientId, long targetClientId,
      long sourceAccountId, long targetAccountId, UUID beneficiaryRef,
      @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal sourceBalance,
      @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal targetBalance, String currency) { }
  private final FixtureCatalog catalog;
  private final FineractCustomerPort customers;
  private final FineractAccountPort accounts;
  private final CustomerIdentityRepository identities;
  private final BeneficiaryRepository beneficiaries;
  private final BeneficiaryTokenService tokens;

  public IsolatedTransferFixtureService(FixtureCatalog catalog, FineractCustomerPort customers,
      FineractAccountPort accounts, CustomerIdentityRepository identities,
      BeneficiaryRepository beneficiaries, BeneficiaryTokenService tokens) {
    this.catalog=catalog; this.customers=customers; this.accounts=accounts;
    this.identities=identities; this.beneficiaries=beneficiaries; this.tokens=tokens;
  }

  public Result prepare(UUID fixtureId, UUID subject) {
    if (fixtureId==null || subject==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"fixtureId and subject are required");
    // Both identifiers participate: another subject cannot share this pair of core accounts.
    String scope="banksystem-rf057-"+fixtureId.toString().replace("-","")+"-"+subject.toString().replace("-","");
    var source=customers.clientByExternalId(scope+"-source");
    var linked=identities.clientIds(subject.toString());
    if (!linked.isEmpty() && (source==null || !linked.equals(java.util.List.of(source.id()))))
      throw conflict("Subject is already linked to another fixture");
    String productName=FixtureLifecycleService.requiredText(catalog.require("product.demo.primarySavings"),"name");
    var products=accounts.savingsProducts().stream().filter(product->productName.equals(product.name())).toList();
    if (products.size()!=1) throw conflict("Exactly one seeded accounting-enabled savings product is required");
    if (source==null) source=customers.createClient("RF057 Source",null,scope+"-source");
    var target=customers.clientByExternalId(scope+"-target");
    if (target==null) target=customers.createClient("RF057 Target",null,scope+"-target");
    var payer=account(source.id(),products.get(0).id(),scope+"-payer",new BigDecimal("1000.00"));
    var payee=account(target.id(),products.get(0).id(),scope+"-payee",new BigDecimal("2000.00"));
    if (!identities.bindNewOrSame(subject.toString(),source.id())) throw conflict("Subject mapping changed during preparation");
    String number=payee.accountNumber();
    UUID beneficiary=beneficiaries.saveScenario(subject.toString(),Long.toString(payee.id()),tokens.token(number),
        number.substring(Math.max(0,number.length()-4)),"RF057隔离收款人",UUID.randomUUID());
    return new Result("READY",fixtureId,subject,source.id(),target.id(),payer.id(),payee.id(),beneficiary,
        payer.balance(),payee.balance(),"CNY");
  }

  /** Resolves an already prepared pair; this path must never create or repair anything. */
  public Result validate(UUID fixtureId, UUID subject, UUID beneficiaryRef) {
    if(fixtureId==null || subject==null || beneficiaryRef==null)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"fixtureId, subject and beneficiaryRef are required");
    String scope="banksystem-rf057-"+fixtureId.toString().replace("-","")+"-"+subject.toString().replace("-","");
    var source=customers.clientByExternalId(scope+"-source");
    var target=customers.clientByExternalId(scope+"-target");
    var payer=accounts.savingsByExternalId(scope+"-payer");
    var payee=accounts.savingsByExternalId(scope+"-payee");
    if(source==null || target==null || payer==null || payee==null)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Prepared fixture does not exist");
    if(!identities.clientIds(subject.toString()).equals(java.util.List.of(source.id())))
      throw conflict("Fixture subject mapping differs");
    if(!beneficiaries.destinationAccount(beneficiaryRef,subject.toString()).orElse("").equals(Long.toString(payee.id())))
      throw conflict("Fixture beneficiary destination differs");
    payer=verifyUnusedAccount(payer.id(),source.id(),new BigDecimal("1000.00"));
    payee=verifyUnusedAccount(payee.id(),target.id(),new BigDecimal("2000.00"));
    return new Result("READY",fixtureId,subject,source.id(),target.id(),payer.id(),payee.id(),beneficiaryRef,
        payer.balance(),payee.balance(),"CNY");
  }

  private FineractAccountPort.SavingsAccount account(long clientId,long productId,String externalId,BigDecimal initial) {
    var existing=accounts.savingsByExternalId(externalId);
    boolean created=existing==null;
    long id=created ? accounts.createSavingsAccount(clientId,productId,"CNY",externalId).id() : existing.id();
    var account=accounts.accountDetails(id);
    if (!Long.valueOf(clientId).equals(account.clientId()) || !"CNY".equals(account.currency()))
      throw conflict("Fixture account ownership or currency differs");
    if (created) {
      if ("savingsAccountStatusType.submitted.and.pending.approval".equals(account.statusCode())) accounts.approveSavings(id);
      else if (!"savingsAccountStatusType.approved".equals(account.statusCode())) throw conflict("New account status is unsupported");
      accounts.activateSavings(id);
    }
    var ledger=accounts.ledgerView(id);
    if (ledger.accountingRule()!=2 || ledger.controlAccountId()==null) throw conflict("Fixture requires real cash-accounting GL mapping");
    if (created) accounts.depositSavings(id,initial);
    return verifyUnusedAccount(id,clientId,initial);
  }

  private FineractAccountPort.SavingsAccount verifyUnusedAccount(long id,long clientId,BigDecimal initial) {
    var account=accounts.accountDetails(id);
    if (!Long.valueOf(clientId).equals(account.clientId()) || !"CNY".equals(account.currency()))
      throw conflict("Fixture account ownership or currency differs");
    var ledger=accounts.ledgerView(id);
    if (ledger.accountingRule()!=2 || ledger.controlAccountId()==null) throw conflict("Fixture requires real cash-accounting GL mapping");
    if (!"savingsAccountStatusType.active".equals(account.statusCode()) || account.balance()==null || initial.compareTo(account.balance())!=0)
      throw conflict("Fixture is used or initial funding is incomplete; money will not be reset");
    var transactions=accounts.savingsTransactions(id,null,null,"CNY");
    if (transactions.size()!=1 || transactions.get(0).reversed() || !"CREDIT".equals(transactions.get(0).type())
        || initial.compareTo(transactions.get(0).amount())!=0 || !ledger.transfers().isEmpty())
      throw conflict("Fixture transaction history is not a single initial funding deposit");
    return account;
  }

  private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
