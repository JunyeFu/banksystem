package local.bank.channel.payments;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ClearingBatchController {
  private final ClearingBatchRepository repository;

  public ClearingBatchController(ClearingBatchRepository repository) { this.repository = repository; }

  @GetMapping("/api/operations/v1/clearing/batches")
  public List<Map<String, Object>> batches() {
    return repository.batches();
  }
}
