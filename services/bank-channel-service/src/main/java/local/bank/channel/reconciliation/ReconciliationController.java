package local.bank.channel.reconciliation;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class ReconciliationController {
  private final ReconciliationService service;
  private final JdbcTemplate jdbc;
  public ReconciliationController(ReconciliationService service, JdbcTemplate jdbc){this.service=service;this.jdbc=jdbc;}
  @PostMapping("/internal/reconciliation/run")
  public Map<String,Object> run(@RequestParam(defaultValue="CHANNEL_TO_CORE") String type){return service.run(type);}
  @GetMapping("/internal/reconciliation/latest")
  public Map<String,Object> latest(){return service.latest();}
  @GetMapping("/api/operations/v1/reconciliations")
  public List<Map<String,Object>> list(){
    return jdbc.query("SELECT run_id,reconciliation_type,status,difference_count,COALESCE(details->>'message',details::text),created_at FROM reconciliation_run ORDER BY created_at DESC",
        (rs,n)->{Map<String,Object> item=new LinkedHashMap<>();item.put("runId",rs.getString(1));item.put("type",rs.getString(2));item.put("status",publicStatus(rs.getString(3)));item.put("differenceCount",rs.getInt(4));item.put("details",rs.getString(5));item.put("createdAt",rs.getObject(6,OffsetDateTime.class).toString());return item;});
  }
  @PostMapping("/api/operations/v1/reconciliations")
  public Map<String,Object> runPublic(@RequestBody Request request){
    Map<String,Object> raw=service.run(request.type());
    return jdbc.queryForObject("SELECT run_id,reconciliation_type,status,difference_count,COALESCE(details->>'message',details::text),created_at FROM reconciliation_run WHERE run_id=?",
        (rs,n)->{Map<String,Object> item=new LinkedHashMap<>();item.put("runId",rs.getString(1));item.put("type",rs.getString(2));item.put("status",publicStatus(rs.getString(3)));item.put("differenceCount",rs.getInt(4));item.put("details",rs.getString(5));item.put("createdAt",rs.getObject(6,OffsetDateTime.class).toString());return item;}, java.util.UUID.fromString(String.valueOf(raw.get("runId"))));
  }
  private static String publicStatus(String status){return "DIFFERENCE".equals(status)?"DIFFERENCE_FOUND":status;}
  public record Request(String type){}
}
