package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientResponseException;

class FineractCapabilityHttpTest {
  @Test void freshCoreLoanProductDeclaresRequiredInterestCalendar() throws IOException {
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var posted = new AtomicReference<String>();
    server.createContext("/api/v1/loanproducts", request -> {
      assertEquals("POST", request.getRequestMethod());
      posted.set(new String(request.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
      respond(request, 200, "{\"resourceId\":17}");
    });
    server.start();
    try {
      assertEquals(17, new FineractLoanPort(transport(server)).createLoanProduct("Synthetic", "SYN1", "CNY").id());
      var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree(posted.get());
      assertEquals(1, body.path("daysInYearType").asInt());
      assertEquals(1, body.path("daysInMonthType").asInt());
      assertTrue(body.has("isInterestRecalculationEnabled"));
      assertEquals(false, body.path("isInterestRecalculationEnabled").asBoolean());
    } finally { server.stop(0); }
  }
  @Test void jobAcceptanceIsNotCompletionAndAmbiguousHistoryCannotAdvance() throws IOException {
    var history=new AtomicReference<>("{\"pageItems\":[]}");
    var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    server.createContext("/api/v1/jobs/31",request->respond(request,200,
        request.getRequestURI().getPath().endsWith("runhistory")?history.get():"{\"currentlyRunning\":false}"));
    server.start();
    try {
      var operations=new FineractOperationsPort(transport(server));
      assertEquals(0,operations.jobVersionBeforeSubmission(31));
      assertTrue(!operations.jobCompletedAfter(31,0));
      history.set("{\"pageItems\":[{\"version\":1,\"status\":\"success\",\"triggerType\":\"application\"}]}");
      assertTrue(operations.jobCompletedAfter(31,0));
      history.set("{\"pageItems\":[{\"version\":1,\"status\":\"success\",\"triggerType\":\"cron\"}]}");
      assertThrows(CoreReadModelException.class,()->operations.jobCompletedAfter(31,0));
      history.set("{\"pageItems\":[{\"version\":1,\"status\":\"failed\",\"triggerType\":\"application\"}]}");
      assertThrows(CoreReadModelException.class,()->operations.jobCompletedAfter(31,0));
    } finally {server.stop(0);}
  }

  @Test void liabilityMappingIsCreatedOnceAndExistingDifferentMappingIsNotOverwritten() throws IOException {
    var mapping=new AtomicReference<>("[]");var writes=new AtomicInteger();
    var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    server.createContext("/api/v1/glaccounts",request->respond(request,200,"[{\"id\":10,\"glCode\":\"BSG2002\",\"type\":{\"id\":2}}]"));
    server.createContext("/api/v1/financialactivityaccounts",request->{
      if(request.getRequestMethod().equals("GET"))respond(request,200,mapping.get());
      else {
        var body=new com.fasterxml.jackson.databind.ObjectMapper().readTree(request.getRequestBody());
        assertEquals(200,body.path("financialActivityId").asInt());assertEquals(10,body.path("glAccountId").asInt());
        writes.incrementAndGet();mapping.set("[{\"financialActivityData\":{\"id\":200},\"glAccountData\":{\"id\":10}}]");
        respond(request,200,"{}");
      }
    });
    server.start();
    try {
      var operations=new FineractOperationsPort(transport(server));
      operations.ensureLiabilityTransferMapping();operations.ensureLiabilityTransferMapping();assertEquals(1,writes.get());
      mapping.set("[{\"financialActivityData\":{\"id\":200},\"glAccountData\":{\"id\":99}}]");
      assertThrows(CoreReadModelException.class,operations::ensureLiabilityTransferMapping);assertEquals(1,writes.get());
    } finally {server.stop(0);}
  }
  @Test
  void savingsProductUsesRealCashAccountingMappings() throws IOException {
    var posted=new AtomicReference<String>();
    var accounts=new AtomicInteger();
    var accountTypes=new java.util.concurrent.ConcurrentHashMap<Long,Integer>();
    HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    server.createContext("/api/v1/glaccounts", request->{
      if(request.getRequestMethod().equals("GET"))respond(request,200,"[]");
      else {
        var account=new com.fasterxml.jackson.databind.ObjectMapper().readTree(request.getRequestBody());
        long id=accounts.incrementAndGet();
        accountTypes.put(id,account.path("type").asInt());
        respond(request,200,"{\"resourceId\":"+id+"}");
      }
    });
    server.createContext("/api/v1/savingsproducts",request->{
      posted.set(new String(request.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
      respond(request,200,"{\"resourceId\":7}");
    });
    server.start();
    try {
      var transport=transport(server);
      var port=new FineractAccountPort(transport,new FineractOperationsPort(transport));
      assertEquals(7,port.createSavingsProduct("GL demo","GLD1","CNY").id());
      var body=new com.fasterxml.jackson.databind.ObjectMapper().readTree(posted.get());
      assertEquals(2,body.path("accountingRule").asInt());
      assertEquals(9,accounts.get());
      assertEquals(2,accountTypes.get(body.path("transfersInSuspenseAccountId").asLong()));
      for(String field:java.util.List.of("savingsReferenceAccountId","savingsControlAccountId",
          "interestOnSavingsAccountId","incomeFromFeeAccountId","incomeFromPenaltyAccountId","transfersInSuspenseAccountId",
          "overdraftPortfolioControlId","incomeFromInterestId","writeOffAccountId"))
        assertTrue(body.path(field).asLong()>0);
    } finally {server.stop(0);}
  }
  @Test
  void customerAndAccountLookupsKeepTenantHeaderAndExistingTransactionReadback() throws IOException {
    var tenant = new AtomicReference<String>();
    var fallback = new AtomicInteger();
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/v1/clients/external-id/known", request -> {
      tenant.set(request.getRequestHeaders().getFirst("fineract-platform-tenantid"));
      respond(request, 200, "{\"id\":11}");
    });
    server.createContext("/api/v1/clients/external-id/missing", request -> respond(request, 404, "{}"));
    server.createContext("/api/v1/savingsaccounts/external-id/known", request ->
        respond(request, 200, "{\"accountId\":21,\"clientId\":11,\"accountNo\":\"000021\",\"currency\":{\"code\":\"CNY\"}}"));
    server.createContext("/api/v1/savingsaccounts/external-id/missing", request -> respond(request, 404, "{}"));
    server.createContext("/api/v1/cashiers", request ->
        respond(request, 200, "[{\"id\":1,\"tellerId\":2,\"coreField\":\"retained\"}]"));
    server.createContext("/api/v1/businessdate/BUSINESS_DATE", request -> respond(request, 200, "{\"date\":[2026,9,23]}"));
    server.createContext("/api/v1/savingsaccounts", request -> respond(request, 200, "{\"resourceId\":31}"));
    server.createContext("/api/v1/savingsaccounts/21/transactions", request ->
        respond(request, "POST".equals(request.getRequestMethod()) ? 200 : 405,
            "POST".equals(request.getRequestMethod()) ? "{\"resourceId\":8}" : "{}"));
    server.createContext("/api/v1/savingsaccounts/21", request -> {
      fallback.incrementAndGet();
      assertTrue(request.getRequestURI().getRawQuery().contains("associations=transactions"));
      respond(request, 200, "{\"transactions\":[{\"id\":7,\"date\":[2026,9,23],\"transactionType\":{\"value\":\"Deposit\",\"deposit\":true},\"amount\":\"100.00\"}]}");
    });
    server.start();
    try {
      var transport = transport(server);
      var customer = new FineractCustomerPort(transport);
      var account = new FineractAccountPort(transport, new FineractOperationsPort(transport));
      assertEquals(11L, customer.clientByExternalId("known").id());
      assertEquals("default", tenant.get());
      assertNull(customer.clientByExternalId("missing"));
      assertEquals(21L, account.savingsByExternalId("known").id());
      assertNull(account.savingsByExternalId("missing"));
      var transactions = account.savingsTransactions(21, null, null, "CNY");
      assertEquals(1, fallback.get());
      assertEquals("CNY", transactions.get(0).currency());
      assertEquals("CREDIT", transactions.get(0).type());
      assertEquals(31L, account.createSavingsAccount(11, 1, "CNY", "fixture-31").id());
      assertEquals(8L, account.depositSavings(21, new BigDecimal("100.00")).transactionId());
      assertEquals("[{\"id\":1,\"tellerId\":2,\"coreField\":\"retained\"}]",
          new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(
              account.cashiers().stream().map(FineractAccountPort.Cashier::corePayload).toList()));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void loanAndOperationsCommandsPreserveIdempotencyAndSurfaceCoreErrors() throws IOException {
    var key = new AtomicReference<String>();
    var loanBody = new AtomicReference<String>();
    var transactionStatus = new AtomicInteger(200);
    var transactionCalls = new AtomicInteger();
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/v1/loans", request -> {
      key.set(request.getRequestHeaders().getFirst("Idempotency-Key"));
      loanBody.set(new String(request.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
      respond(request, 200, "{\"resourceId\":91}");
    });
    server.createContext("/api/v1/loans/91/transactions", request -> {
      transactionCalls.incrementAndGet();
      respond(request, transactionStatus.get(), transactionStatus.get() == 200 ? "{\"resourceId\":92}" : "{\"error\":\"core\"}");
    });
    server.createContext("/api/v1/loans/91", request -> respond(request, 200,
        "{\"id\":91,\"principal\":\"30000.00\",\"loanBalanceOutstanding\":\"20000.00\",\"currency\":{\"code\":\"CNY\"},\"status\":{\"value\":\"Active\"}}"));
    server.createContext("/api/v1/jobs/31", request -> respond(request, 200, "{}"));
    server.createContext("/api/v1/journalentries", request -> respond(request, 200,
        "{\"pageItems\":[{\"id\":92,\"transactionId\":\"S123\",\"amount\":\"100.00\",\"entryType\":{\"value\":\"DEBIT\"}}]}"));
    server.start();
    try {
      var transport = transport(server);
      var loans = new FineractLoanPort(transport);
      var operations = new FineractOperationsPort(transport);
      var command = new FineractLoanPort.LoanSubmissionCommand(11, 1, new BigDecimal("30000.00"),
          12, new BigDecimal("4.35"), LocalDate.of(2026, 9, 23), "EQUAL_INSTALLMENTS");
      assertEquals(91L, loans.submitLoan(command, "loan-key-0001").loanId());
      assertEquals("loan-key-0001", key.get());
      assertTrue(loanBody.get().contains("\"interestRatePerPeriod\":0.36250000"));
      assertTrue(loanBody.get().contains("\"amortizationType\":1"));
      loans.submitLoan(new FineractLoanPort.LoanSubmissionCommand(11, 1, new BigDecimal("30000.00"),
          12, new BigDecimal("4.35"), LocalDate.of(2026, 9, 23), "EQUAL_PRINCIPAL"), "principal-key-0001");
      assertTrue(loanBody.get().contains("\"amortizationType\":0"));
      assertEquals("Active", loans.loanDetails(91).status());
      var repayment = loans.loanTransaction(91, "repayment", new BigDecimal("100.00"),
          LocalDate.of(2026, 9, 23), "repay-key-0001");
      assertEquals(92, repayment.corePayload().get("resourceId").asInt());
      assertEquals("{\"core\":{\"resourceId\":92}}",
          new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(
              java.util.Map.of("core", repayment.corePayload())));
      operations.runCobBatch();
      assertEquals("DEBIT", operations.journalEntries().get(0).entryType());
      assertEquals("S123", operations.journalEntries().get(0).transactionId());

      transactionStatus.set(400);
      assertEquals(400, assertThrows(RestClientResponseException.class, () ->
          loans.loanTransaction(91, "repayment", new BigDecimal("100.00"),
              LocalDate.of(2026, 9, 23), "repay-key-0001")).getStatusCode().value());
      transactionStatus.set(503);
      assertEquals(503, assertThrows(RestClientResponseException.class, () ->
          loans.loanTransaction(91, "repayment", new BigDecimal("100.00"),
              LocalDate.of(2026, 9, 23), "repay-key-0001")).getStatusCode().value());
      assertEquals(3, transactionCalls.get());
    } finally {
      server.stop(0);
    }
  }

  private static FineractTransport transport(HttpServer server) {
    return new FineractTransport("http://127.0.0.1:" + server.getAddress().getPort(),
        "default", "demo", "secret", org.mockito.Mockito.mock(CoreWriteRepository.class));
  }

  private static void respond(HttpExchange request, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    request.getResponseHeaders().set("Content-Type", "application/json");
    request.sendResponseHeaders(status, bytes.length);
    try (var output = request.getResponseBody()) { output.write(bytes); }
  }
}
