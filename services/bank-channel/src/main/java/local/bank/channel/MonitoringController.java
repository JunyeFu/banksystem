package local.bank.channel;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@RestController
public class MonitoringController {
  private final JdbcTemplate jdbc;
  private final RestClient core;
  public MonitoringController(JdbcTemplate jdbc, RestClient.Builder builder){this.jdbc=jdbc;this.core=builder.baseUrl("http://mifos-isolated-fineract-server-1:8080/fineract-provider").build();}
  @GetMapping("/internal/monitoring/alerts")
  public Map<String,Object> alerts(){List<Map<String,String>> result=new ArrayList<>();try{core.get().uri("/actuator/health").retrieve().toBodilessEntity();}catch(Exception e){result.add(Map.of("code","CORE_OUTAGE","severity","P1"));}Integer pending=jdbc.queryForObject("SELECT count(*) FROM transfer WHERE status IN ('PROCESSING','RECEIVED')",Integer.class);if(pending!=null&&pending>0)result.add(Map.of("code","TRANSFER_PENDING","severity","P2"));Integer undelivered=jdbc.queryForObject("SELECT count(*) FROM transfer_outbox WHERE published_at IS NULL",Integer.class);if(undelivered!=null&&undelivered>0)result.add(Map.of("code","OUTBOX_BACKLOG","severity","P2"));return Map.of("alerts",result,"count",result.size());}
}
