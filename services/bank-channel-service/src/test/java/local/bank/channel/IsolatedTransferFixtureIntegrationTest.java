package local.bank.channel;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import local.bank.channel.identity.CustomerIdentityRepository;
import local.bank.channel.beneficiaries.BeneficiaryRepository;
import local.bank.channel.beneficiaries.BeneficiaryTokenService;

/** Real repositories and HTTP ports; the external core is a contract fixture, not LIVE evidence. */
class IsolatedTransferFixtureIntegrationTest {
  static EmbeddedPostgres postgres;
  HttpServer core;
  final ObjectMapper json = new ObjectMapper();
  final Map<String, Long> clients = new HashMap<>();
  final Map<String, Map<String, Object>> accounts = new HashMap<>();
  long sequence = 100;
  int deposits;
  int coreWrites;
  boolean rejectDeposit;
  IsolatedTransferFixtureService service;
  CustomerIdentityRepository identities;
  BeneficiaryRepository beneficiaries;

  @BeforeAll static void start() throws Exception { postgres = EmbeddedPostgres.start(); }
  @AfterAll static void stop() throws Exception { postgres.close(); }
  @AfterEach void stopCore() { core.stop(0); }

  @BeforeEach void prepare() throws Exception {
    var jdbc = new JdbcTemplate(postgres.getPostgresDatabase());
    jdbc.execute("DROP TABLE IF EXISTS customer_identity, beneficiary, eod_run");
    jdbc.execute("CREATE TABLE customer_identity(subject varchar(128) PRIMARY KEY, fineract_client_id bigint NOT NULL)");
    jdbc.execute("CREATE TABLE eod_run(status text)");
    jdbc.execute("""
        CREATE TABLE beneficiary(beneficiary_id uuid PRIMARY KEY, subject varchar(128), account_token char(64),
          account_last4 varchar(4), display_name varchar(160), destination_account_id text,
          created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(subject,account_token))
        """);
    identities = new CustomerIdentityRepository(jdbc);
    beneficiaries = new BeneficiaryRepository(jdbc);
    core = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    core.createContext("/api/v1/", exchange -> {
      String path = exchange.getRequestURI().getPath().substring("/api/v1/".length());
      String method = exchange.getRequestMethod();
      if(!method.equals("GET")) coreWrites++;
      Map<?, ?> body = method.equals("POST") ? json.readValue(exchange.getRequestBody(), Map.class) : Map.of();
      Object response;
      int status = 200;
      if (path.equals("businessdate/BUSINESS_DATE")) response = Map.of("date", List.of(2026,10,9));
      else if (path.equals("savingsproducts")) response = List.of(Map.of("id", 9, "name", "BankSystem GL Demo Savings v1"));
      else if (path.equals("savingsproducts/9")) response = Map.of("accountingRule", Map.of("id",2),
          "accountingMappings", Map.of("savingsControlAccount", Map.of("id", 501)));
      else if (path.startsWith("clients/external-id/")) {
        Long id = clients.get(path.substring("clients/external-id/".length()));
        status = id == null ? 404 : 200;
        response = id == null ? Map.of() : Map.of("id",id);
      } else if (path.equals("clients")) {
        long id = ++sequence; clients.put(body.get("externalId").toString(), id); response = Map.of("resourceId",id);
      } else if (path.startsWith("savingsaccounts/external-id/")) {
        var account = accounts.get(path.substring("savingsaccounts/external-id/".length()));
        status = account == null ? 404 : 200; response = account == null ? Map.of() : account;
      } else if (path.equals("savingsaccounts")) {
        long id = ++sequence;
        var account = new HashMap<String,Object>();
        account.put("id",id); account.put("clientId",body.get("clientId")); account.put("accountNo","RF"+id);
        account.put("currency",Map.of("code","CNY")); account.put("savingsProductId",9);
        account.put("status",Map.of("code","savingsAccountStatusType.submitted.and.pending.approval"));
        account.put("summary",Map.of("accountBalance",BigDecimal.ZERO)); account.put("transactions",List.of());
        accounts.put(body.get("externalId").toString(),account); response = Map.of("resourceId",id);
      } else if (path.startsWith("savingsaccounts/")) {
        long id = Long.parseLong(path.split("/")[1]);
        var account = accounts.values().stream().filter(row -> ((Number)row.get("id")).longValue()==id).findFirst().orElseThrow();
        if (method.equals("GET")) response = path.endsWith("/transactions") ? account.get("transactions") : account;
        else if (path.endsWith("/transactions")) {
          deposits++;
          if (rejectDeposit) { status = 503; response = Map.of(); }
          else {
            account.put("summary",Map.of("accountBalance",new BigDecimal(body.get("transactionAmount").toString())));
            long transactionId=++sequence;
            account.put("transactions",List.of(Map.of("id",transactionId,"date",List.of(2026,10,9),
                "transactionType",Map.of("deposit",true,"value","Deposit"),"amount",body.get("transactionAmount"),
                "runningBalance",body.get("transactionAmount"))));
            response = Map.of("resourceId",transactionId);
          }
        } else {
          String command = exchange.getRequestURI().getQuery();
          account.put("status",Map.of("code",command.equals("command=activate") ? "savingsAccountStatusType.active" : "savingsAccountStatusType.approved"));
          response = Map.of("resourceId",id);
        }
      } else { status = 500; response = Map.of("unexpectedPath",path); }
      byte[] bytes = json.writeValueAsBytes(response);
      exchange.getResponseHeaders().set("Content-Type","application/json");
      exchange.sendResponseHeaders(status,bytes.length);
      try (var output=exchange.getResponseBody()) { output.write(bytes); }
    });
    core.start();
    var transport = new FineractTransport("http://127.0.0.1:"+core.getAddress().getPort(),"default","test","test",new CoreWriteRepository(postgres.getPostgresDatabase()));
    var operations = new FineractOperationsPort(transport);
    service = new IsolatedTransferFixtureService(new FixtureCatalog(Path.of("../../contracts/fixtures/baseline-fixtures.yaml").toString()),
        new FineractCustomerPort(transport),new FineractAccountPort(transport,operations),identities,beneficiaries,new BeneficiaryTokenService("contract-only-secret"));
  }

  @Test void preparesIndependentAccountsAndReplaysWithoutAdditionalMoney() {
    UUID fixture = UUID.randomUUID(), subject = UUID.randomUUID();
    var first = service.prepare(fixture,subject);
    assertEquals("READY",first.status());
    assertEquals(new BigDecimal("1000.00"),first.sourceBalance());
    assertEquals(new BigDecimal("2000.00"),first.targetBalance());
    assertNotEquals(first.sourceAccountId(),first.targetAccountId());
    assertEquals(List.of(first.sourceClientId()),identities.clientIds(subject.toString()));
    assertEquals(Long.toString(first.targetAccountId()),beneficiaries.destinationAccount(first.beneficiaryRef(),subject.toString()).orElseThrow());
    assertEquals(first,service.prepare(fixture,subject));
    assertEquals(2,deposits);
    var second = service.prepare(UUID.randomUUID(),UUID.randomUUID());
    assertNotEquals(first.sourceAccountId(),second.sourceAccountId());
    assertNotEquals(first.targetAccountId(),second.targetAccountId());
  }

  @Test void refusesAnExistingCustomerMappingBeforeCreatingCoreClients() {
    UUID subject=UUID.randomUUID(); identities.bind(subject.toString(),11L);
    var failure=assertThrows(org.springframework.web.server.ResponseStatusException.class,
        ()->service.prepare(UUID.randomUUID(),subject));
    assertEquals(409,failure.getStatusCode().value());
    assertEquals(List.of(11L),identities.clientIds(subject.toString()));
    assertTrue(clients.isEmpty());
    assertEquals(0,deposits);
  }

  @Test void refusesUsedMoneyWithoutReplenishingIt() {
    UUID fixture=UUID.randomUUID(), subject=UUID.randomUUID();
    var prepared=service.prepare(fixture,subject);
    accounts.values().stream().filter(row->((Number)row.get("id")).longValue()==prepared.sourceAccountId())
        .findFirst().orElseThrow().put("summary",Map.of("accountBalance",new BigDecimal("999.00")));
    var failure=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.prepare(fixture,subject));
    assertEquals(409,failure.getStatusCode().value());
    assertEquals(2,deposits);
  }

  @Test void refusesUsedHistoryEvenWhenTheBalanceWasRestored() {
    UUID fixture=UUID.randomUUID(), subject=UUID.randomUUID();
    var prepared=service.prepare(fixture,subject);
    var account=accounts.values().stream().filter(row->((Number)row.get("id")).longValue()==prepared.sourceAccountId()).findFirst().orElseThrow();
    var old=(List<?>)account.get("transactions");
    account.put("transactions",List.of(old.get(0),old.get(0)));
    var failure=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.prepare(fixture,subject));
    assertEquals(409,failure.getStatusCode().value());
    assertEquals(2,deposits);
  }

  @Test void anUnknownDepositOutcomeIsNotResubmittedOnAnExplicitReplay() {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID(); rejectDeposit=true;
    assertThrows(org.springframework.web.client.RestClientResponseException.class,()->service.prepare(fixture,subject));
    assertEquals(1,deposits);
    rejectDeposit=false;
    var failure=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.prepare(fixture,subject));
    assertEquals(409,failure.getStatusCode().value());
    assertEquals(1,deposits);
    assertTrue(identities.clientIds(subject.toString()).isEmpty());
  }

  @Test void conditionalBindingCannotOverwriteAnotherFixture() {
    String subject=UUID.randomUUID().toString();
    assertTrue(identities.bindNewOrSame(subject,101));
    assertTrue(identities.bindNewOrSame(subject,101));
    assertFalse(identities.bindNewOrSame(subject,102));
    assertEquals(List.of(101L),identities.clientIds(subject));
  }

  @Test void wrongOwnerAndCurrencyAreRejectedWithoutMoneyWrites() {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID();
    var prepared=service.prepare(fixture,subject);
    var account=accounts.values().stream().filter(row->((Number)row.get("id")).longValue()==prepared.sourceAccountId()).findFirst().orElseThrow();
    account.put("clientId",999L);
    var ownership=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.prepare(fixture,subject));
    assertEquals(409,ownership.getStatusCode().value());
    account.put("clientId",prepared.sourceClientId());
    account.put("currency",Map.of("code","USD"));
    var currency=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.prepare(fixture,subject));
    assertEquals(409,currency.getStatusCode().value());
    assertEquals(2,deposits);
  }

  @Test void balancesHaveAnExplicitDecimalStringWireRepresentation() throws Exception {
    var result=service.prepare(UUID.randomUUID(),UUID.randomUUID());
    var response=json.readTree(json.writeValueAsBytes(result));
    assertTrue(response.get("sourceBalance").isTextual());
    assertEquals("1000.00",response.get("sourceBalance").textValue());
    assertTrue(response.get("targetBalance").isTextual());
    assertEquals("2000.00",response.get("targetBalance").textValue());
  }

  @Test void validatesExistingFixtureWithoutAnyCoreOrChannelWrites() {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID();
    var prepared=service.prepare(fixture,subject);
    long sequenceBefore=sequence;
    int writesBefore=coreWrites;
    var beneficiaryBefore=beneficiaries.list(subject.toString());
    assertEquals(prepared,service.validate(fixture,subject,prepared.beneficiaryRef()));
    assertEquals(prepared,service.validate(fixture,subject,prepared.beneficiaryRef()));
    assertEquals(sequenceBefore,sequence);assertEquals(2,deposits);
    assertEquals(writesBefore,coreWrites);
    assertEquals(beneficiaryBefore,beneficiaries.list(subject.toString()));
    assertEquals(List.of(prepared.sourceClientId()),identities.clientIds(subject.toString()));
  }

  @Test void validationNeverCreatesMissingFixturesOrRepairsWrongBindings() {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID();
    var missing=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.validate(fixture,subject,UUID.randomUUID()));
    assertEquals(404,missing.getStatusCode().value());assertTrue(clients.isEmpty());assertTrue(accounts.isEmpty());assertEquals(0,deposits);
    var prepared=service.prepare(fixture,subject);
    var wrongPayee=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.validate(fixture,subject,UUID.randomUUID()));
    assertEquals(409,wrongPayee.getStatusCode().value());
    identities.bind(subject.toString(),999L);
    var wrongSubject=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.validate(fixture,subject,prepared.beneficiaryRef()));
    assertEquals(409,wrongSubject.getStatusCode().value());
    assertEquals(List.of(999L),identities.clientIds(subject.toString()));assertEquals(2,deposits);
  }

  @Test void validationRejectsUsedHistoryRestoredBalanceWrongOwnerCurrencyAndStatusWithoutFunding() {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID();var prepared=service.prepare(fixture,subject);
    var account=accounts.values().stream().filter(row->((Number)row.get("id")).longValue()==prepared.sourceAccountId()).findFirst().orElseThrow();
    for (var mutation:List.of(
        Map.of("summary",Map.of("accountBalance",new BigDecimal("999.00"))),
        Map.of("transactions",List.of(((List<?>)account.get("transactions")).get(0),((List<?>)account.get("transactions")).get(0))),
        Map.of("clientId",999L),Map.of("currency",Map.of("code","USD")),
        Map.of("status",Map.of("code","savingsAccountStatusType.closed")))) {
      String key=mutation.keySet().iterator().next();Object old=account.get(key);account.put(key,mutation.get(key));
      var failure=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.validate(fixture,subject,prepared.beneficiaryRef()));
      assertEquals(409,failure.getStatusCode().value());account.put(key,old);
    }
    assertEquals(2,deposits);
  }

  @Test void validationRequiresAllScopeIdentifiersWithoutCreatingData() {
    UUID id=UUID.randomUUID();
    for(var scope:List.of(new UUID[]{null,id,id},new UUID[]{id,null,id},new UUID[]{id,id,null})) {
      var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.validate(scope[0],scope[1],scope[2]));
      assertEquals(400,error.getStatusCode().value());
    }
    assertTrue(clients.isEmpty());assertTrue(accounts.isEmpty());assertEquals(0,coreWrites);
  }

  @Test void readOnlyHttpContractBindsUuidInputsAndReturnsDecimalStrings() throws Exception {
    UUID fixture=UUID.randomUUID(),subject=UUID.randomUUID();var prepared=service.prepare(fixture,subject);
    var controller=new TestSupportController(identities,beneficiaries,null,null,null,null,null,null,null,null,null,service);
    var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
    String route="/internal/test-support/v1/transfer-fixtures/"+fixture;
    int writesBefore=coreWrites;
    var response=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(route)
        .param("subject",subject.toString()).param("beneficiaryRef",prepared.beneficiaryRef().toString())).andReturn().getResponse();
    assertEquals(200,response.getStatus());var body=json.readTree(response.getContentAsByteArray());
    assertEquals("1000.00",body.get("sourceBalance").textValue());assertEquals("2000.00",body.get("targetBalance").textValue());
    assertEquals(400,mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(route)).andReturn().getResponse().getStatus());
    assertEquals(400,mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(route)
        .param("subject","invalid").param("beneficiaryRef",prepared.beneficiaryRef().toString())).andReturn().getResponse().getStatus());
    assertEquals(writesBefore,coreWrites);
  }
}
