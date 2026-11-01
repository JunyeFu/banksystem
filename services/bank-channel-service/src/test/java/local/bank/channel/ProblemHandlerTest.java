package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

class ProblemHandlerTest {
  @Test
  void coreFailureDoesNotExposeUpstreamResponseBody() {
    var upstream = HttpClientErrorException.create(HttpStatus.BAD_REQUEST, "bad", HttpHeaders.EMPTY,
        "secret upstream detail".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    var problem = new ProblemHandler().coreFailure(upstream);
    assertEquals("FINERACT_ADAPTER_FAILURE", problem.getProperties().get("code"));
    assertFalse(problem.getProperties().containsKey("coreResponse"));
  }
}
