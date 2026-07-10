package local.bank.channel;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

@RestController
public class EodController {
  private final JdbcTemplate jdbc; private final RestClient core;
  public EodController(JdbcTemplate jdbc, RestClient.Builder builder){this.jdbc=jdbc;this.core=builder.baseUrl("http://mifos-isolated-fineract-server-1:8080/fineract-provider").build();}
  @PostMapping("/internal/eod/run")
  public Map<String,Object> run(@RequestParam(required=false) LocalDate businessDate){LocalDate date=businessDate==null?LocalDate.now():businessDate;String status="COMPLETED";String recon="MATCHED";String reason="EOD prerequisites satisfied";try{core.get().uri("/actuator/health").retrieve().toBodilessEntity();}catch(Exception e){status="FAILED";recon="BLOCKED";reason="Core health unavailable";}Integer pending=jdbc.queryForObject("SELECT count(*) FROM transfer WHERE status IN ('RECEIVED','PROCESSING')",Integer.class);if(pending!=null&&pending>0){status="FAILED";recon="DIFFERENCE";reason="Pending transfer exists";}UUID id=UUID.randomUUID();jdbc.update("INSERT INTO eod_run(run_id,business_date,status,reconciliation_status,reason) VALUES(?,?,?,?,?)",id,date,status,recon,reason);return Map.of("runId",id.toString(),"businessDate",date.toString(),"status",status,"reconciliationStatus",recon,"reason",reason);}
  @GetMapping("/internal/eod/latest")
  public Map<String,Object> latest(){var rows=jdbc.query("SELECT run_id,business_date,status,reconciliation_status,reason FROM eod_run ORDER BY created_at DESC LIMIT 1",(rs,n)->Map.<String,Object>of("runId",rs.getString(1),"businessDate",rs.getDate(2).toString(),"status",rs.getString(3),"reconciliationStatus",rs.getString(4),"reason",rs.getString(5)));return rows.isEmpty()?Map.of("status","NOT_STARTED"):rows.get(0);}
}
