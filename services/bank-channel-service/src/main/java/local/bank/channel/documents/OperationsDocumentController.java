package local.bank.channel.documents;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import local.bank.channel.audit.AuditService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class OperationsDocumentController {
  private static final Set<String> CATEGORIES = Set.of("POLICY", "PROCEDURE", "REPORT", "COMPLIANCE", "OTHER");
  private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "ARCHIVED");
  private static final long MAX_FILE_SIZE = 20L * 1024 * 1024;
  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public OperationsDocumentController(JdbcTemplate jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

  @GetMapping("/api/operations/v1/documents")
  public List<Map<String,Object>> list(@RequestParam(required=false) String category,
      @RequestParam(required=false) String status, @RequestParam(required=false) String query) {
    validateOptional(category, CATEGORIES, "category"); validateOptional(status, STATUSES, "status");
    String keyword = query == null ? "" : query.trim();
    return jdbc.query("""
        SELECT document_id,title,category,status,version,uploaded_by,uploaded_at,file_name,content_type,file_size,checksum,description
        FROM operations_document
        WHERE (? IS NULL OR category=?) AND (? IS NULL OR status=?)
          AND (?='' OR lower(title) LIKE lower('%'||?||'%') OR lower(COALESCE(description,'')) LIKE lower('%'||?||'%'))
        ORDER BY uploaded_at DESC
        """, (rs,n)->document(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getString(6),
            rs.getObject(7,OffsetDateTime.class).toString(),rs.getString(8),rs.getString(9),rs.getLong(10),rs.getString(11),rs.getString(12)),
        category,category,status,status,keyword,keyword,keyword);
  }

  @PostMapping(value="/api/operations/v1/documents", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  @Transactional
  public Map<String,Object> upload(@RequestPart MultipartFile file, @RequestPart String title,
      @RequestPart String category, @RequestPart(required=false) String description, @AuthenticationPrincipal Jwt jwt) throws Exception {
    if (file.isEmpty() || file.getSize() > MAX_FILE_SIZE) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"File must contain 1 byte to 20 MiB");
    if (title == null || title.isBlank() || title.length() > 240) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Title is required and must not exceed 240 characters");
    validateOptional(category,CATEGORIES,"category");
    if (description != null && description.length() > 1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Description must not exceed 1000 characters");
    byte[] bytes=file.getBytes(); UUID id=UUID.randomUUID(); String actor=jwt == null ? "unknown" : jwt.getSubject();
    String fileName=file.getOriginalFilename()==null||file.getOriginalFilename().isBlank()?"document.bin":file.getOriginalFilename();
    String contentType=file.getContentType()==null?MediaType.APPLICATION_OCTET_STREAM_VALUE:file.getContentType();
    String checksum=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    jdbc.update("INSERT INTO operations_document(document_id,title,category,status,version,uploaded_by,file_name,content_type,file_size,checksum,description,content) VALUES(?,?,?,'DRAFT',1,?,?,?,?,?,?,?)",
        id,title.trim(),category,actor,fileName,contentType,bytes.length,checksum,description,bytes);
    audit.record("CREATE","USER",actor,"OPERATIONS_DOCUMENT",id.toString(),"UPLOAD","SUCCESS",null,Map.of("title",title.trim(),"category",category,"checksum",checksum));
    return find(id);
  }

  @PatchMapping("/api/operations/v1/documents/{documentId}/status")
  @Transactional
  public Map<String,Object> updateStatus(@PathVariable UUID documentId, @RequestBody StatusRequest request, @AuthenticationPrincipal Jwt jwt) {
    validateOptional(request.status(),STATUSES,"status"); Map<String,Object> before=find(documentId);
    int changed=jdbc.update("UPDATE operations_document SET status=?,version=version+1 WHERE document_id=?",request.status(),documentId);
    if(changed==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found");
    String actor=jwt==null?"unknown":jwt.getSubject(); audit.record("UPDATE","USER",actor,"OPERATIONS_DOCUMENT",documentId.toString(),"CHANGE_STATUS","SUCCESS",Map.of("status",before.get("status")),Map.of("status",request.status()));
    return find(documentId);
  }

  @GetMapping("/api/operations/v1/documents/{documentId}/download")
  public ResponseEntity<byte[]> download(@PathVariable UUID documentId, @AuthenticationPrincipal Jwt jwt) {
    var rows=jdbc.query("SELECT file_name,content_type,content FROM operations_document WHERE document_id=?",(rs,n)->new Download(rs.getString(1),rs.getString(2),rs.getBytes(3)),documentId);
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found"); Download value=rows.get(0); String actor=jwt==null?"unknown":jwt.getSubject();
    audit.record("EXECUTE","USER",actor,"OPERATIONS_DOCUMENT",documentId.toString(),"DOWNLOAD","SUCCESS",null,null);
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(value.contentType())).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(value.fileName(), StandardCharsets.UTF_8).build().toString()).body(value.content());
  }

  private Map<String,Object> find(UUID id){
    var rows=jdbc.query("SELECT document_id,title,category,status,version,uploaded_by,uploaded_at,file_name,content_type,file_size,checksum,description FROM operations_document WHERE document_id=?",
        (rs,n)->document(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getString(6),rs.getObject(7,OffsetDateTime.class).toString(),rs.getString(8),rs.getString(9),rs.getLong(10),rs.getString(11),rs.getString(12)),id);
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found"); return rows.get(0);
  }
  private static Map<String,Object> document(String id,String title,String category,String status,int version,String uploadedBy,String uploadedAt,String fileName,String contentType,long fileSize,String checksum,String description){
    Map<String,Object> item=new LinkedHashMap<>();item.put("documentId",id);item.put("title",title);item.put("category",category);item.put("status",status);item.put("version",version);item.put("uploadedBy",uploadedBy);item.put("uploadedAt",uploadedAt);item.put("fileName",fileName);item.put("contentType",contentType);item.put("fileSize",fileSize);item.put("checksum",checksum);item.put("description",description);return item;
  }
  private static void validateOptional(String value,Set<String> allowed,String field){if(value!=null&&!allowed.contains(value))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported "+field);}
  public record StatusRequest(String status){}
  private record Download(String fileName,String contentType,byte[] content){}
}
