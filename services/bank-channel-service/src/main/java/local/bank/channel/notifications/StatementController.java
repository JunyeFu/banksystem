package local.bank.channel.notifications;

import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import local.bank.channel.identity.CustomerIdentityQuery;
import local.bank.channel.identity.CustomerTransactionMapper;
import local.bank.channel.FineractAccountPort;

@RestController
public class StatementController {
  private final FineractAccountPort fineract; private final CustomerIdentityQuery identity;
  public StatementController(FineractAccountPort fineract,CustomerIdentityQuery identity){this.fineract=fineract;this.identity=identity;}
  @GetMapping("/api/customer/v1/statements")
  public ResponseEntity<byte[]> statement(@AuthenticationPrincipal Jwt jwt,@RequestParam String accountId,@RequestParam(required=false) String fromDate,@RequestParam(required=false) String toDate,@RequestParam(defaultValue="csv") String format){
    long id;try{id=Long.parseLong(accountId);}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid accountId");}
    var accounts=fineract.clientAccounts(identity.linkedClient(jwt.getSubject()));
    if(accounts.stream().noneMatch(a->a.id()==id))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Account is not linked");
    FineractAccountPort.SavingsAccount account=fineract.accountDetails(id);
    List<Map<String,Object>> rows=fineract.savingsTransactions(id,fromDate,toDate,account.currency()).stream()
        .map(raw->{Map<String,Object> mapped=new LinkedHashMap<>(CustomerTransactionMapper.map(raw));mapped.put("reversed",raw.reversed());return mapped;})
        .sorted(Comparator.<Map<String,Object>,String>comparing(row->String.valueOf(row.get("transactionDate")))
            .thenComparing(row->String.valueOf(row.get("transactionId"))))
        .toList();
    var summary=balanceSummary(rows,account);
    String csv="# openingBalance="+summary.opening+",credits="+summary.credits+",debits="+summary.debits+",closingBalance="+summary.closing+",balanceCheck="+summary.balanced+"\n"+"date,type,amount,runningBalance,reversed\n"+rows.stream().map(this::csvRow).reduce("",String::concat);
    if(format.equalsIgnoreCase("pdf")){return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).header("X-Statement-Balance-Check",String.valueOf(summary.balanced)).body(buildPdf(csv));}
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv")).header("X-Statement-Balance-Check",String.valueOf(summary.balanced)).body(csv.getBytes(StandardCharsets.UTF_8));
  }
  private BalanceSummary balanceSummary(List<Map<String,Object>> rows,FineractAccountPort.SavingsAccount account){
    BigDecimal credits=BigDecimal.ZERO,debits=BigDecimal.ZERO;
    for(var row:rows){
      BigDecimal amount=CustomerTransactionMapper.money(row.get("amount"),"statement amount");
      if("CREDIT".equals(row.get("transactionType")))credits=credits.add(amount);
      else debits=debits.add(amount);
    }
    BigDecimal closing=rows.isEmpty()||rows.get(rows.size()-1).get("runningBalance")==null
        ?account.balance()
        :CustomerTransactionMapper.money(rows.get(rows.size()-1).get("runningBalance"),"statement closing balance");
    BigDecimal opening=closing.subtract(credits).add(debits);
    return new BalanceSummary(opening,credits,debits,closing,opening.add(credits).subtract(debits).compareTo(closing)==0);
  }
  private record BalanceSummary(BigDecimal opening,BigDecimal credits,BigDecimal debits,BigDecimal closing,boolean balanced){}
  private String csvRow(Map<String,Object> row){return String.join(",",String.valueOf(row.get("transactionDate")),String.valueOf(row.get("transactionType")),String.valueOf(row.get("amount")),String.valueOf(row.getOrDefault("runningBalance","")),String.valueOf(row.get("reversed")))+"\n";}
  private byte[] buildPdf(String text){
    String safe=text.replace("\\","\\\\").replace("(","\\(").replace(")","\\)").replace("\n", ") Tj T* (");
    String stream="BT /F1 8 Tf 40 760 Td ("+safe+") Tj ET";
    String[] objects={"<</Type/Catalog/Pages 2 0 R>>","<</Type/Pages/Kids [3 0 R]/Count 1>>","<</Type/Page/Parent 2 0 R/MediaBox [0 0 612 792]/Resources <</Font <</F1 4 0 R>>>>/Contents 5 0 R>>","<</Type/Font/Subtype/Type1/BaseFont/Courier>>","<</Length "+stream.getBytes(StandardCharsets.US_ASCII).length+">>stream\n"+stream+"\nendstream"};
    var out=new java.io.ByteArrayOutputStream();try{out.write("%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII));int[] offsets=new int[objects.length];for(int i=0;i<objects.length;i++){offsets[i]=out.size();out.write(((i+1)+" 0 obj\n").getBytes(StandardCharsets.US_ASCII));out.write(objects[i].getBytes(StandardCharsets.US_ASCII));out.write("\nendobj\n".getBytes(StandardCharsets.US_ASCII));}int xref=out.size();out.write(("xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n").getBytes(StandardCharsets.US_ASCII));for(int o:offsets)out.write(String.format(java.util.Locale.ROOT,"%010d 00000 n \n",o).getBytes(StandardCharsets.US_ASCII));out.write(("trailer\n<</Size "+(objects.length+1)+"/Root 1 0 R>>\nstartxref\n"+xref+"\n%%EOF\n").getBytes(StandardCharsets.US_ASCII));return out.toByteArray();}catch(Exception e){throw new IllegalStateException(e);}
  }
}
