package local.bank.channel.reconciliation;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class ReconciliationController {
  private final ReconciliationService service;
  private final ReconciliationRepository repository;
  public ReconciliationController(ReconciliationService service, ReconciliationRepository repository){this.service=service;this.repository=repository;}
  @PostMapping("/internal/reconciliation/run")
  public Map<String,Object> run(@RequestParam(defaultValue="CHANNEL_TO_CORE") String type){return service.run(type);}
  @GetMapping("/internal/reconciliation/latest")
  public Map<String,Object> latest(){return service.latest();}
  @GetMapping("/api/operations/v1/reconciliations")
  public List<Map<String,Object>> list(){
    return repository.listPublic();
  }
  @PostMapping("/api/operations/v1/reconciliations")
  public Map<String,Object> runPublic(@RequestBody Request request){
    Map<String,Object> raw=service.run(request.type());
    return repository.publicRun(java.util.UUID.fromString(String.valueOf(raw.get("runId"))));
  }
  public record Request(String type){}
}
