package local.bank.channel;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class StatementController {
  private final FineractAdapter fineract; private final CustomerController customer;
  public StatementController(FineractAdapter fineract,CustomerController customer){this.fineract=fineract;this.customer=customer;}
  @GetMapping("/api/customer/v1/statements")
  public ResponseEntity<byte[]> statement(@AuthenticationPrincipal Jwt jwt,@RequestParam String accountId,@RequestParam(required=false) String fromDate,@RequestParam(required=false) String toDate,@RequestParam(defaultValue="csv") String format){
    long id;try{id=Long.parseLong(accountId);}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid accountId");}
    var accounts=fineract.clientAccounts(customer.linkedClientForStatement(jwt.getSubject()));
    if(accounts.stream().noneMatch(a->String.valueOf(a.getOrDefault("id",a.get("accountId"))).equals(accountId)))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Account is not linked");
    List<Map<String,Object>> rows=fineract.savingsTransactions(id,fromDate,toDate);String csv="date,type,amount,runningBalance,reversed\n"+rows.stream().map(this::csvRow).reduce("",String::concat);
    if(format.equalsIgnoreCase("pdf")){return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(buildPdf(csv));}
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv")).body(csv.getBytes(StandardCharsets.UTF_8));
  }
  private String csvRow(Map<String,Object> row){var type=(Map<?,?>)row.get("transactionType");return String.join(",",String.valueOf(row.get("date")),String.valueOf(type==null?"":type.get("value")),String.valueOf(row.get("amount")),String.valueOf(row.get("runningBalance")),String.valueOf(row.get("reversed")))+"\n";}
  private byte[] buildPdf(String text){
    String safe=text.replace("\\","\\\\").replace("(","\\(").replace(")","\\)").replace("\n", ") Tj T* (");
    String stream="BT /F1 8 Tf 40 760 Td ("+safe+") Tj ET";
    String[] objects={"<</Type/Catalog/Pages 2 0 R>>","<</Type/Pages/Kids [3 0 R]/Count 1>>","<</Type/Page/Parent 2 0 R/MediaBox [0 0 612 792]/Resources <</Font <</F1 4 0 R>>>>/Contents 5 0 R>>","<</Type/Font/Subtype/Type1/BaseFont/Courier>>","<</Length "+stream.getBytes(StandardCharsets.US_ASCII).length+">>stream\n"+stream+"\nendstream"};
    var out=new java.io.ByteArrayOutputStream();try{out.write("%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII));int[] offsets=new int[objects.length];for(int i=0;i<objects.length;i++){offsets[i]=out.size();out.write(((i+1)+" 0 obj\n").getBytes(StandardCharsets.US_ASCII));out.write(objects[i].getBytes(StandardCharsets.US_ASCII));out.write("\nendobj\n".getBytes(StandardCharsets.US_ASCII));}int xref=out.size();out.write(("xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n").getBytes(StandardCharsets.US_ASCII));for(int o:offsets)out.write(String.format(java.util.Locale.ROOT,"%010d 00000 n \n",o).getBytes(StandardCharsets.US_ASCII));out.write(("trailer\n<</Size "+(objects.length+1)+"/Root 1 0 R>>\nstartxref\n"+xref+"\n%%EOF\n").getBytes(StandardCharsets.US_ASCII));return out.toByteArray();}catch(Exception e){throw new IllegalStateException(e);}
  }
}
