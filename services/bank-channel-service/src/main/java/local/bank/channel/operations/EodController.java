package local.bank.channel.operations;

import java.time.LocalDate;
import java.util.Map;
import local.bank.channel.operations.EodCoordinator;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class EodController {
  private final EodCoordinator service;

  public EodController(EodCoordinator service) {
    this.service = service;
  }

  @PostMapping("/internal/eod/run")
  public Map<String, Object> runInternal(
      @RequestParam(required = false) LocalDate businessDate,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
    return service.run(businessDate, idempotencyKey);
  }

  @PostMapping("/api/operations/v1/eod/run")
  public Map<String, Object> runPublic(@RequestHeader("Idempotency-Key") String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.length() < 16 || idempotencyKey.length() > 128)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "Idempotency-Key must contain 16 to 128 characters");
    return service.run(null, idempotencyKey);
  }

  @GetMapping({"/internal/eod/latest", "/api/operations/v1/eod/latest"})
  public Map<String, Object> latest() {
    return service.latest();
  }
}
