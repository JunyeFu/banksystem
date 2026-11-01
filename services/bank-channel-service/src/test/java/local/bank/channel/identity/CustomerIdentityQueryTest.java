package local.bank.channel.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CustomerIdentityQueryTest {
  @Test
  void resolvesLinkedClientAndPreservesMissingMappingResponse() {
    var repository = mock(CustomerIdentityRepository.class);
    var query = new CustomerIdentityQuery(repository);
    when(repository.clientIds("known")).thenReturn(List.of(41L));
    when(repository.clientIds("missing")).thenReturn(List.of());

    assertEquals(41L, query.linkedClient("known"));
    assertEquals(HttpStatus.NOT_FOUND,
        assertThrows(ResponseStatusException.class, () -> query.linkedClient("missing")).getStatusCode());
  }
}
