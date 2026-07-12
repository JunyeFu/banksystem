package local.bank.channel.reconciliation;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class ReconciliationController {
  private final ReconciliationService service;
  public ReconciliationController(ReconciliationService service){this.service=service;}
  @PostMapping("/internal/reconciliation/run")
  public Map<String,Object> run(@RequestParam(defaultValue="CHANNEL_TO_CORE") String type){return service.run(type);}
  @GetMapping("/internal/reconciliation/latest")
  public Map<String,Object> latest(){return service.latest();}
}
