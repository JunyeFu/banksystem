package local.bank.channel;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TransferReversalController {
  private final JdbcTemplate jdbc; private final FineractAdapter fineract;
  public TransferReversalController(JdbcTemplate jdbc,FineractAdapter fineract){this.jdbc=jdbc;this.fineract=fineract;}
  @PostMapping("/api/operations/v1/transfers/{transferId}/reversal")
  public Map<String,Object> request(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID transferId,@RequestBody Reason reason){
    if(reason.reason()==null||reason.reason().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason is required");
    var rows=jdbc.query("SELECT status FROM transfer WHERE transfer_id=?",(rs,n)->rs.getString(1),transferId);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found");
    if(!"POSTED".equals(rows.get(0)))throw new ResponseStatusException(HttpStatus.CONFLICT,"Only posted transfers can be reversed");
    UUID id=UUID.randomUUID();jdbc.update("INSERT INTO transfer_reversal(reversal_id,transfer_id,maker_subject,status,reason) VALUES(?,?,?,?,?)",id,transferId,jwt.getSubject(),"PENDING",reason.reason());return Map.of("reversalId",id.toString(),"status","PENDING","version",1);
  }
  @PostMapping("/api/operations/v1/transfers/reversals/{reversalId}/approve")
  public Map<String,Object> approve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reversalId,@RequestParam int version,@RequestBody Reason reason,@RequestHeader("Idempotency-Key") String key){
    if(reason.reason()==null||reason.reason().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason is required");
    var rev=jdbc.query("SELECT transfer_id,maker_subject,status,version FROM transfer_reversal WHERE reversal_id=? FOR UPDATE",(rs,n)->Map.<String,Object>of("transfer",rs.getObject(1),"maker",rs.getString(2),"status",rs.getString(3),"version",rs.getInt(4)),reversalId);
    if(rev.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Reversal not found");var r=rev.get(0);if(r.get("maker").equals(jwt.getSubject()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Maker cannot check own reversal");if(!"PENDING".equals(r.get("status"))||(Integer)r.get("version")!=version)throw new ResponseStatusException(HttpStatus.CONFLICT,"Reversal version/state changed");
    UUID transferId=(UUID)r.get("transfer");var rows=jdbc.query("SELECT source_account_id,destination_account_id,amount,currency,status FROM transfer WHERE transfer_id=?",(rs,n)->Map.<String,Object>of("source",rs.getString(1),"destination",rs.getString(2),"amount",rs.getBigDecimal(3),"currency",rs.getString(4),"status",rs.getString(5)),transferId);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Transfer not found");var t=rows.get(0);if(!"POSTED".equals(t.get("status")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Transfer is not posted");
    Map<String,Object> core=fineract.accountTransfer(Long.parseLong((String)t.get("destination")),Long.parseLong((String)t.get("source")),(BigDecimal)t.get("amount"),(String)t.get("currency"),key);String ref=String.valueOf(core.getOrDefault("resourceId",core.getOrDefault("id","")));jdbc.update("UPDATE transfer_reversal SET checker_subject=?,status='APPROVED',version=version+1,core_reference=? WHERE reversal_id=?",jwt.getSubject(),ref,reversalId);jdbc.update("UPDATE transfer SET status='COMPENSATED' WHERE transfer_id=?",transferId);jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)",UUID.randomUUID(),transferId,"transfer.reversed","{\"transferId\":\""+transferId+"\",\"status\":\"COMPENSATED\",\"coreReference\":\""+ref+"\"}");return Map.of("reversalId",reversalId.toString(),"transferId",transferId.toString(),"status","APPROVED","coreReference",ref,"version",version+1);
  }
  public record Reason(String reason){}
}
