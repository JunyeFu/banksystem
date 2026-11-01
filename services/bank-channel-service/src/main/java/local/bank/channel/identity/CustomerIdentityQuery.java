package local.bank.channel.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerIdentityQuery {
  private final CustomerIdentityRepository repository;

  public CustomerIdentityQuery(CustomerIdentityRepository repository) { this.repository = repository; }

  public long linkedClient(String subject) {
    var ids = repository.clientIds(subject);
    if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer identity is not linked");
    return ids.get(0);
  }
}
