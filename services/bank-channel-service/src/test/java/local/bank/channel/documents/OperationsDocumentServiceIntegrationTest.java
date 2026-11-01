package local.bank.channel.documents;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import local.bank.channel.audit.AuditService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

class OperationsDocumentServiceIntegrationTest {
  private static EmbeddedPostgres postgres;
  private JdbcTemplate jdbc;
  private AuditService audit;
  private OperationsDocumentService service;

  @BeforeAll
  static void startPostgres() throws java.io.IOException { postgres = EmbeddedPostgres.start(); }

  @AfterAll
  static void stopPostgres() throws java.io.IOException { if (postgres != null) postgres.close(); }

  @BeforeEach
  void setUp() {
    jdbc = new JdbcTemplate(postgres.getPostgresDatabase());
    jdbc.execute("DROP TABLE IF EXISTS operations_document");
    jdbc.execute("""
        CREATE TABLE operations_document(
          document_id uuid PRIMARY KEY,title varchar(240) NOT NULL,category varchar(32) NOT NULL,
          status varchar(16) NOT NULL DEFAULT 'DRAFT',version integer NOT NULL DEFAULT 1,
          uploaded_by varchar(128) NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now(),
          file_name varchar(255) NOT NULL,content_type varchar(128) NOT NULL,file_size bigint NOT NULL,
          checksum char(64) NOT NULL,description varchar(1000),content bytea NOT NULL)
        """);
    audit = mock(AuditService.class);
    service = new OperationsDocumentService(new OperationsDocumentRepository(jdbc), audit);
  }

  @Test
  void uploadDownloadPublishArchiveAndRejectInvalidTransitions() throws Exception {
    byte[] bytes = "controlled policy".getBytes(StandardCharsets.UTF_8);
    var file = new MockMultipartFile("file","policy.txt","text/plain",bytes);
    var draft = service.upload(file,"Policy","POLICY",null,"operator-1");
    UUID id = UUID.fromString((String) draft.get("documentId"));
    assertEquals("DRAFT",draft.get("status"));
    assertEquals(1,draft.get("version"));
    assertEquals(1,service.list("POLICY",null,"").size());
    assertArrayEquals(bytes,service.download(id,"operator-1").content());
    assertEquals("PUBLISHED",service.updateStatus(id,"PUBLISHED",1,"operator-1").get("status"));
    assertEquals("ARCHIVED",service.updateStatus(id,"ARCHIVED",2,"operator-1").get("status"));
    assertEquals(3,service.list(null,"ARCHIVED","").get(0).get("version"));
    assertStatus(HttpStatus.CONFLICT, () -> service.updateStatus(id,"PUBLISHED",3,"operator-1"));
    verify(audit,times(4)).record(any(),any(),any(),any(),any(),any(),any(),any(),any());
  }

  @Test
  void staleMissingAndIllegalRequestsDoNotWriteSuccessAudit() throws Exception {
    var file = new MockMultipartFile("file","policy.txt","text/plain",new byte[]{1});
    var draft = service.upload(file,"Policy","POLICY",null,"operator-1");
    UUID id = UUID.fromString((String) draft.get("documentId"));
    assertStatus(HttpStatus.BAD_REQUEST, () -> service.updateStatus(id,"PUBLISHED",null,"operator-1"));
    assertStatus(HttpStatus.BAD_REQUEST, () -> service.updateStatus(id,"PUBLISHED",0,"operator-1"));
    assertStatus(HttpStatus.BAD_REQUEST, () -> service.updateStatus(id,"INVALID",1,"operator-1"));
    assertStatus(HttpStatus.CONFLICT, () -> service.updateStatus(id,"ARCHIVED",1,"operator-1"));
    assertStatus(HttpStatus.CONFLICT, () -> service.updateStatus(id,"PUBLISHED",2,"operator-1"));
    assertStatus(HttpStatus.NOT_FOUND, () -> service.updateStatus(UUID.randomUUID(),"PUBLISHED",1,"operator-1"));
    verify(audit,times(1)).record(any(),any(),any(),any(),any(),any(),any(),any(),any());
    assertEquals("DRAFT",service.list(null,null,"").get(0).get("status"));
  }

  @Test
  void concurrentSameVersionHasOneWinner() throws Exception {
    var file = new MockMultipartFile("file","policy.txt","text/plain",new byte[]{1});
    UUID id = UUID.fromString((String) service.upload(file,"Policy","POLICY",null,"operator-1").get("documentId"));
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var attempts = new ArrayList<java.util.concurrent.Future<Integer>>();
      for (int i=0;i<2;i++) attempts.add(pool.submit(() -> {
        ready.countDown();
        start.await();
        try { service.updateStatus(id,"PUBLISHED",1,"operator-1"); return 200; }
        catch (ResponseStatusException error) { return error.getStatusCode().value(); }
      }));
      ready.await();
      start.countDown();
      List<Integer> results = List.of(attempts.get(0).get(),attempts.get(1).get());
      assertTrue(results.containsAll(List.of(200,409)),results.toString());
    }
    assertEquals(2,service.list(null,null,"").get(0).get("version"));
    verify(audit,times(2)).record(any(),any(),any(),any(),any(),any(),any(),any(),any());
  }

  private static void assertStatus(HttpStatus expected, Runnable action) {
    assertEquals(expected,assertThrows(ResponseStatusException.class,action::run).getStatusCode());
  }
}
