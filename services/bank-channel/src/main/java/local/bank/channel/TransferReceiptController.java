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
public class TransferReceiptController {
  private final JdbcTemplate jdbc;
  public TransferReceiptController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @GetMapping("/api/customer/v1/transfers/{transferId}/receipt")
  public Map<String,Object> receipt(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID transferId){
    var rows=jdbc.query("SELECT receipt_id,payload,sha256,created_at FROM transfer_receipt WHERE transfer_id=? AND subject=?",(rs,n)->Map.<String,Object>of("receiptId",rs.getString(1),"payload",rs.getString(2),"sha256",rs.getString(3),"createdAt",rs.getObject(4).toString()),transferId,jwt.getSubject());
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Receipt not found");
    return rows.get(0);
  }
}
