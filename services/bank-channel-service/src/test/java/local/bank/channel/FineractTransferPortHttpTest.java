package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class FineractTransferPortHttpTest {
  @Test
  void sharesTransportHeadersAndClassifiesDefiniteVersusUnknownOutcomes() throws IOException {
    var status = new AtomicInteger(200);
    var dropResponse = new AtomicBoolean(false);
    var seenKey = new AtomicReference<String>();
    var seenDescription = new AtomicReference<String>();
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/v1/savingsaccounts/101", request -> respond(request, 200, "{\"id\":101,\"clientId\":11}"));
    server.createContext("/api/v1/savingsaccounts/202", request -> respond(request, 200, "{\"id\":202,\"clientId\":22}"));
    server.createContext("/api/v1/businessdate/BUSINESS_DATE", request -> respond(request, 200, "{\"date\":[2026,9,23]}"));
    server.createContext("/api/v1/accounttransfers", request -> {
      seenKey.set(request.getRequestHeaders().getFirst("Idempotency-Key"));
      seenDescription.set(request.getRequestURI().getRawQuery());
      if (dropResponse.get()) { request.close(); return; }
      respond(request, status.get(), status.get() == 200 ? "{\"resourceId\":77}" : "{\"error\":\"core failure\"}");
    });
    server.start();
    try {
      var transport = new FineractTransport("http://127.0.0.1:" + server.getAddress().getPort(), "default", "demo", "secret", org.mockito.Mockito.mock(CoreWriteRepository.class));
      var operations = new FineractOperationsPort(transport);
      var accounts = new FineractAccountPort(transport, operations);
      var transfers = new FineractTransferPort(transport, accounts, operations);
      assertEquals(77, transfers.accountTransfer(101, 202, new BigDecimal("100.00"), "CNY", "test-key").coreId());
      assertEquals("test-key", seenKey.get());
      assertTrue(seenDescription.get().contains("transferDescription=HENGZHUN"));

      status.set(400);
      assertEquals(400, assertThrows(FineractTransferPort.CoreTransferRejectedException.class,
          () -> transfers.accountTransfer(101, 202, new BigDecimal("100.00"), "CNY", "test-key")).status());
      status.set(503);
      assertThrows(FineractTransferPort.CoreTransferOutcomeUnknownException.class,
          () -> transfers.accountTransfer(101, 202, new BigDecimal("100.00"), "CNY", "test-key"));
      dropResponse.set(true);
      assertThrows(FineractTransferPort.CoreTransferOutcomeUnknownException.class,
          () -> transfers.accountTransfer(101, 202, new BigDecimal("100.00"), "CNY", "test-key"));
    } finally {
      server.stop(0);
    }
  }

  private static void respond(HttpExchange request, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    request.getResponseHeaders().set("Content-Type", "application/json");
    request.sendResponseHeaders(status, bytes.length);
    try (var output = request.getResponseBody()) { output.write(bytes); }
  }
}
