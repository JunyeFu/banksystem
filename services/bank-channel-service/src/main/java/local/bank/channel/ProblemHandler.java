package local.bank.channel;

import java.net.URI;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ProblemHandler {
  @ExceptionHandler(RestClientResponseException.class)
  ProblemDetail coreFailure(RestClientResponseException ex) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_GATEWAY);
    problem.setType(URI.create("urn:bank:error:adapter-failure"));
    problem.setTitle("Core adapter request failed");
    problem.setProperty("code", "FINERACT_ADAPTER_FAILURE");
    problem.setProperty("coreStatus", ex.getStatusCode().value());
    String requestId = MDC.get("requestId");
    String correlationId = MDC.get("correlationId");
    if (requestId != null) problem.setProperty("requestId", requestId);
    if (correlationId != null) problem.setProperty("correlationId", correlationId);
    String body = ex.getResponseBodyAsString();
    if (body != null && !body.isBlank())
      problem.setProperty("coreResponse", body.substring(0, Math.min(body.length(), 2000)));
    return problem;
  }

  @ExceptionHandler(ResponseStatusException.class)
  ProblemDetail statusException(ResponseStatusException ex) {
    ProblemDetail problem = ProblemDetail.forStatus(ex.getStatusCode());
    problem.setTitle(ex.getReason() == null ? "Request error" : ex.getReason());
    problem.setProperty("code", mapStatusCode(ex.getStatusCode().value()));
    String requestId = MDC.get("requestId");
    String correlationId = MDC.get("correlationId");
    if (requestId != null) problem.setProperty("requestId", requestId);
    if (correlationId != null) problem.setProperty("correlationId", correlationId);
    return problem;
  }

  @ExceptionHandler(IllegalArgumentException.class)
  ProblemDetail invalidRequest(IllegalArgumentException ex) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
    problem.setType(URI.create("urn:bank:error:invalid-request"));
    problem.setTitle("Invalid request");
    problem.setProperty("code", "INVALID_REQUEST");
    problem.setDetail(ex.getMessage());
    String requestId = MDC.get("requestId");
    String correlationId = MDC.get("correlationId");
    if (requestId != null) problem.setProperty("requestId", requestId);
    if (correlationId != null) problem.setProperty("correlationId", correlationId);
    return problem;
  }

  private String mapStatusCode(int status) {
    return switch (status) {
      case 400 -> "BAD_REQUEST";
      case 401 -> "UNAUTHORIZED";
      case 403 -> "FORBIDDEN";
      case 404 -> "NOT_FOUND";
      case 409 -> "CONFLICT";
      case 422 -> "UNPROCESSABLE_ENTITY";
      case 429 -> "RATE_LIMITED";
      default -> "ERROR";
    };
  }
}
