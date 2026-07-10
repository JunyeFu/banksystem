package local.bank.channel;

import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;

@RestControllerAdvice
public class ProblemHandler {
  @ExceptionHandler(RestClientResponseException.class)
  ProblemDetail coreFailure(RestClientResponseException ex) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_GATEWAY);
    problem.setType(URI.create("https://bank.local/problems/core-adapter"));
    problem.setTitle("Core adapter request failed");
    problem.setProperty("code", "FINERACT_ADAPTER_FAILURE");
    problem.setProperty("coreStatus", ex.getStatusCode().value());
    String body = ex.getResponseBodyAsString();
    if (body != null && !body.isBlank()) problem.setProperty("coreResponse", body.substring(0, Math.min(body.length(), 2000)));
    return problem;
  }
  @ExceptionHandler(IllegalArgumentException.class)
  ProblemDetail invalidRequest(IllegalArgumentException ex) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
    problem.setType(URI.create("https://bank.local/problems/invalid-request"));
    problem.setTitle("Invalid request");
    problem.setProperty("code", "INVALID_REQUEST");
    return problem;
  }
}
