package local.bank.channel;

import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TransferProcessorController {
  private final TransferProcessor processor;
  public TransferProcessorController(TransferProcessor processor) { this.processor = processor; }
  @PostMapping("/internal/transfers/{transferId}/process")
  public Map<String,Object> process(@PathVariable UUID transferId) { return processor.process(transferId); }
}
