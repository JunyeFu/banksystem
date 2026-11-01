package local.bank.channel.documents;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import local.bank.channel.audit.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OperationsDocumentService {
  private static final Set<String> CATEGORIES = Set.of("POLICY", "PROCEDURE", "REPORT", "COMPLIANCE", "OTHER");
  private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "ARCHIVED");
  private static final long MAX_FILE_SIZE = 20L * 1024 * 1024;
  private final OperationsDocumentRepository repository;
  private final AuditService audit;

  public OperationsDocumentService(OperationsDocumentRepository repository, AuditService audit) {
    this.repository = repository;
    this.audit = audit;
  }

  public List<Map<String,Object>> list(String category, String status, String query) {
    validateOptional(category, CATEGORIES, "category");
    validateOptional(status, STATUSES, "status");
    return repository.list(category, status, query == null ? "" : query.trim());
  }

  @Transactional
  public Map<String,Object> upload(MultipartFile file, String title, String category, String description, String actor) throws Exception {
    if (file.isEmpty() || file.getSize() > MAX_FILE_SIZE)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"File must contain 1 byte to 20 MiB");
    if (title == null || title.isBlank() || title.length() > 240)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Title is required and must not exceed 240 characters");
    validateOptional(category,CATEGORIES,"category");
    if (description != null && description.length() > 1000)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Description must not exceed 1000 characters");
    byte[] bytes = file.getBytes();
    UUID id = UUID.randomUUID();
    String fileName = file.getOriginalFilename()==null||file.getOriginalFilename().isBlank()
        ? "document.bin" : file.getOriginalFilename();
    String contentType = file.getContentType()==null?MediaType.APPLICATION_OCTET_STREAM_VALUE:file.getContentType();
    String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    repository.insert(id,title.trim(),category,actor,fileName,contentType,bytes,checksum,description);
    audit.record("CREATE","USER",actor,"OPERATIONS_DOCUMENT",id.toString(),"UPLOAD","SUCCESS",null,
        Map.of("title",title.trim(),"category",category,"checksum",checksum));
    return find(id);
  }

  @Transactional
  public Map<String,Object> updateStatus(UUID id, String next, Integer version, String actor) {
    if (next == null || !STATUSES.contains(next) || version == null || version < 1)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Status and positive version are required");
    Map<String,Object> before = find(id);
    String current = (String) before.get("status");
    if (!(current.equals("DRAFT") && next.equals("PUBLISHED"))
        && !(current.equals("PUBLISHED") && next.equals("ARCHIVED")))
      throw new ResponseStatusException(HttpStatus.CONFLICT,"Document status transition is not allowed");
    if (repository.transition(id,current,next,version) != 1)
      throw new ResponseStatusException(HttpStatus.CONFLICT,"Document version or status changed");
    audit.record("UPDATE","USER",actor,"OPERATIONS_DOCUMENT",id.toString(),"CHANGE_STATUS","SUCCESS",
        Map.of("status",current),Map.of("status",next));
    return find(id);
  }

  public OperationsDocumentRepository.Download download(UUID id, String actor) {
    var value = repository.download(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found"));
    audit.record("EXECUTE","USER",actor,"OPERATIONS_DOCUMENT",id.toString(),"DOWNLOAD","SUCCESS",null,null);
    return value;
  }

  private Map<String,Object> find(UUID id) {
    return repository.find(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found"));
  }

  private static void validateOptional(String value,Set<String> allowed,String field) {
    if(value!=null&&!allowed.contains(value))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported "+field);
  }
}
