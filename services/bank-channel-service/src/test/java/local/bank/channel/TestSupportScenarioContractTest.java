package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;

import java.nio.file.Path;
import java.util.List;
import local.bank.channel.audit.AuditRepository;
import local.bank.channel.audit.AuditService;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.beneficiaries.BeneficiaryTokenService;
import local.bank.channel.identity.CustomerIdentityRepository;
import local.bank.channel.notifications.NotificationRepository;
import org.junit.jupiter.api.Test;

class TestSupportScenarioContractTest {
  @Test void failedCoreTransactionReadCannotTriggerScenarioFunding() {
    var identities = mock(CustomerIdentityRepository.class);
    when(identities.clientIds("scenario-source-0001")).thenReturn(List.of(1L));
    when(identities.clientIds("fixture-bob")).thenReturn(List.of(2L));
    var accounts = mock(FineractAccountPort.class);
    var catalog = new FixtureCatalog(Path.of("../../contracts/fixtures/baseline-fixtures.yaml").toString());
    when(accounts.savingsByExternalId((String) catalog.require("account.alice.primarySavings").get("externalId")))
        .thenReturn(new FineractAccountPort.SavingsAccount(1L, 1L, "00000001", "CNY", java.math.BigDecimal.ZERO, "Synthetic", "ACTIVE", "active", null));
    when(accounts.savingsByExternalId((String) catalog.require("account.bob.primarySavings").get("externalId")))
        .thenReturn(new FineractAccountPort.SavingsAccount(2L, 2L, "00000002", "CNY", java.math.BigDecimal.ZERO, "Synthetic", "ACTIVE", "active", null));
    when(accounts.savingsTransactions(1L, null, null, "CNY")).thenThrow(new IllegalStateException("Core read unavailable"));
    var controller = new TestSupportController(identities, mock(BeneficiaryRepository.class),
        mock(NotificationRepository.class), mock(AuditRepository.class), mock(TestSupportProjectionRepository.class),
        accounts, mock(FineractOperationsPort.class), mock(AuditService.class), mock(BeneficiaryTokenService.class),
        catalog, mock(FixtureLifecycleService.class), mock(IsolatedTransferFixtureService.class));
    var result = controller.seedCustomerScenario(new TestSupportController.CustomerScenarioRequest(
        "scenario-source-0001", "customer.alice", "customer.bob"));
    assertEquals("FAILED", result.getBody().get("status"));
    assertEquals("CHECK_TRANSACTIONS", result.getBody().get("failureStage"));
    verify(accounts, never()).depositSavings(anyLong(), any());
  }
  @Test void scenarioReadsTheSameAccountsAsTheCanonicalSeedCatalog() {
    var identities = mock(CustomerIdentityRepository.class);
    when(identities.clientIds("scenario-source-0001")).thenReturn(List.of(1L));
    when(identities.clientIds("fixture-bob")).thenReturn(List.of(2L));
    var accounts = mock(FineractAccountPort.class);
    var catalog = new FixtureCatalog(Path.of("../../contracts/fixtures/baseline-fixtures.yaml").toString());
    var controller = new TestSupportController(identities, mock(BeneficiaryRepository.class),
        mock(NotificationRepository.class), mock(AuditRepository.class), mock(TestSupportProjectionRepository.class),
        accounts, mock(FineractOperationsPort.class), mock(AuditService.class), mock(BeneficiaryTokenService.class),
        catalog, mock(FixtureLifecycleService.class), mock(IsolatedTransferFixtureService.class));
    var result = controller.seedCustomerScenario(new TestSupportController.CustomerScenarioRequest(
        "scenario-source-0001", "customer.alice", "customer.bob"));
    assertEquals("FAILED", result.getBody().get("status"));
    assertEquals("LOAD_ACCOUNTS", result.getBody().get("failureStage"));
    verify(accounts).savingsByExternalId((String) catalog.require("account.alice.primarySavings").get("externalId"));
    verify(accounts).savingsByExternalId((String) catalog.require("account.bob.primarySavings").get("externalId"));
  }
}
