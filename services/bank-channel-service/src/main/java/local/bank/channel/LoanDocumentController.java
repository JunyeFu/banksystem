package local.bank.channel;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class LoanDocumentController {
  private final JdbcTemplate jdbc;
  public LoanDocumentController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @PostMapping("/api/customer/v1/loans/applications/{id}/documents")
  public Map<String,Object> add(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Request request){
    if(request.documentType()==null||request.documentType().isBlank()||request.storageRef()==null||request.storageRef().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Document metadata is required");
    Integer owned=jdbc.queryForObject("SELECT count(*) FROM loan_application WHERE application_id=? AND subject=?",Integer.class,id,jwt.getSubject());if(owned==null||owned==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Application not found");UUID doc=UUID.randomUUID();jdbc.update("INSERT INTO loan_document(document_id,application_id,subject,document_type,storage_ref) VALUES(?,?,?,?,?)",doc,id,jwt.getSubject(),request.documentType(),request.storageRef());return Map.of("documentId",doc.toString(),"status","RECEIVED","documentType",request.documentType());
  }
  @GetMapping("/api/customer/v1/loans/applications/{id}/documents")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return Map.of("items",jdbc.query("SELECT document_id,document_type,status FROM loan_document WHERE application_id=? AND subject=? ORDER BY created_at",(rs,n)->Map.of("documentId",rs.getString(1),"documentType",rs.getString(2),"status",rs.getString(3)),id,jwt.getSubject()));}
  public record Request(String documentType,String storageRef){}
}
