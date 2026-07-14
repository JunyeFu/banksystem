package local.bank.channel.payments;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.nio.charset.StandardCharsets;

@RestController
public class TransferReceiptController {
  private final JdbcTemplate jdbc;
  public TransferReceiptController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @GetMapping("/api/customer/v1/transfers/{transferId}/receipt")
  public ResponseEntity<?> receipt(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID transferId,@RequestParam(defaultValue="json") String format){
    var rows=jdbc.query("SELECT receipt_id,payload,sha256,created_at FROM transfer_receipt WHERE transfer_id=? AND subject=?",(rs,n)->Map.<String,Object>of("receiptId",rs.getString(1),"payload",rs.getString(2),"sha256",rs.getString(3),"createdAt",rs.getObject(4).toString()),transferId,jwt.getSubject());
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Receipt not found");
    if (format.equalsIgnoreCase("pdf")) {
      Map<String,Object> row=rows.get(0);
      return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(buildPdf("LOCAL BANK SANDBOX RECEIPT\nReceipt: "+row.get("receiptId")+"\nTransfer: "+transferId+"\nSHA-256: "+row.get("sha256")+"\n"+row.get("payload")+"\nLOCAL TEST ONLY"));
    }
    return ResponseEntity.ok(rows.get(0));
  }
  private byte[] buildPdf(String text){String safe=text.replace("\\","\\\\").replace("(","\\(").replace(")","\\)").replace("\n",") Tj T* (");String stream="BT /F1 8 Tf 40 760 Td ("+safe+") Tj ET";String[] objects={"<</Type/Catalog/Pages 2 0 R>>","<</Type/Pages/Kids [3 0 R]/Count 1>>","<</Type/Page/Parent 2 0 R/MediaBox [0 0 612 792]/Resources <</Font <</F1 4 0 R>>>>/Contents 5 0 R>>","<</Type/Font/Subtype/Type1/BaseFont/Courier>>","<</Length "+stream.getBytes(StandardCharsets.US_ASCII).length+">>stream\n"+stream+"\nendstream"};var out=new java.io.ByteArrayOutputStream();try{out.write("%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII));int[] offsets=new int[objects.length];for(int i=0;i<objects.length;i++){offsets[i]=out.size();out.write(((i+1)+" 0 obj\n").getBytes(StandardCharsets.US_ASCII));out.write(objects[i].getBytes(StandardCharsets.US_ASCII));out.write("\nendobj\n".getBytes(StandardCharsets.US_ASCII));}int xref=out.size();out.write(("xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n").getBytes(StandardCharsets.US_ASCII));for(int o:offsets)out.write(String.format(java.util.Locale.ROOT,"%010d 00000 n \n",o).getBytes(StandardCharsets.US_ASCII));out.write(("trailer\n<</Size "+(objects.length+1)+"/Root 1 0 R>>\nstartxref\n"+xref+"\n%%EOF\n").getBytes(StandardCharsets.US_ASCII));return out.toByteArray();}catch(Exception e){throw new IllegalStateException(e);}}
}
