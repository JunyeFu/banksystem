package local.bank.channel.documents;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class OperationsDocumentController {
  private final OperationsDocumentService documents;

  public OperationsDocumentController(OperationsDocumentService documents) { this.documents = documents; }

  @GetMapping("/api/operations/v1/documents")
  public List<Map<String,Object>> list(@RequestParam(required=false) String category,
      @RequestParam(required=false) String status, @RequestParam(required=false) String query) {
    return documents.list(category,status,query);
  }

  @PostMapping(value="/api/operations/v1/documents", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String,Object> upload(@RequestPart MultipartFile file, @RequestPart String title,
      @RequestPart String category, @RequestPart(required=false) String description,
      @AuthenticationPrincipal Jwt jwt) throws Exception {
    return documents.upload(file,title,category,description,actor(jwt));
  }

  @PatchMapping("/api/operations/v1/documents/{documentId}/status")
  public Map<String,Object> updateStatus(@PathVariable UUID documentId, @RequestBody StatusRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    return documents.updateStatus(documentId,request.status(),request.version(),actor(jwt));
  }

  @GetMapping("/api/operations/v1/documents/{documentId}/download")
  public ResponseEntity<byte[]> download(@PathVariable UUID documentId, @AuthenticationPrincipal Jwt jwt) {
    var value = documents.download(documentId,actor(jwt));
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(value.contentType()))
        .header(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(value.fileName(),StandardCharsets.UTF_8).build().toString())
        .body(value.content());
  }

  private static String actor(Jwt jwt) { return jwt == null ? "unknown" : jwt.getSubject(); }
  public record StatusRequest(String status, Integer version) {}
}
