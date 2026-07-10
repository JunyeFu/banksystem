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
    if(format.equalsIgnoreCase("pdf")){String pdf="%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\n%%EOF\n"+csv;return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(pdf.getBytes(StandardCharsets.UTF_8));}
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv")).body(csv.getBytes(StandardCharsets.UTF_8));
  }
  private String csvRow(Map<String,Object> row){var type=(Map<?,?>)row.get("transactionType");return String.join(",",String.valueOf(row.get("date")),String.valueOf(type==null?"":type.get("value")),String.valueOf(row.get("amount")),String.valueOf(row.get("runningBalance")),String.valueOf(row.get("reversed")))+"\n";}
}
