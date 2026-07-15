package local.bank.channel.operations;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExternalServiceController {
  private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  @Value("${external-services.mifos-health-url:http://mifos-isolated-web-app-1}") private String mifosHealth;
  @Value("${external-services.keycloak-health-url:http://keycloak:8080/realms/bank-internal/.well-known/openid-configuration}") private String keycloakHealth;
  @Value("${external-services.grafana-health-url:http://grafana:3000/api/health}") private String grafanaHealth;

  @GetMapping("/api/operations/v1/external-services")
  public Map<String,Object> services(){
    List<Map<String,Object>> items=List.of(
        service("MIFOS_X","Mifos X 核心管理后台","客户、账户、贷款、产品与会计管理","http://127.0.0.1:18080",mifosHealth),
        service("KEYCLOAK","Keycloak 身份管理","Realm、用户、角色、客户端与会话治理","http://127.0.0.1:19000",keycloakHealth),
        service("GRAFANA","Grafana 可观测平台","指标看板、告警、日志与数据源管理","http://127.0.0.1:19001",grafanaHealth));
    long available=items.stream().filter(item->"AVAILABLE".equals(item.get("status"))).count();
    String overall=available==items.size()?"AVAILABLE":available==0?"UNAVAILABLE":"PARTIAL";
    return Map.of("overallStatus",overall,"checkedAt",OffsetDateTime.now().toString(),"items",items);
  }
  private Map<String,Object> service(String id,String name,String purpose,String launchUrl,String healthUrl){
    long started=System.nanoTime();String status="UNAVAILABLE";
    try{HttpResponse<Void> response=client.send(HttpRequest.newBuilder(URI.create(healthUrl)).timeout(Duration.ofSeconds(3)).GET().build(),HttpResponse.BodyHandlers.discarding());if(response.statusCode()<500)status="AVAILABLE";}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}catch(Exception ignored){/* unavailable */}
    return Map.of("serviceId",id,"displayName",name,"purpose",purpose,"launchUrl",launchUrl,"status",status,"latencyMs",Math.max(0,(System.nanoTime()-started)/1_000_000));
  }
}
