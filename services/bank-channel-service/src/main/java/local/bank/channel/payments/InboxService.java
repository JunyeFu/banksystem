package local.bank.channel.payments;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InboxService {
  private final InboxRepository repository;
  public InboxService(InboxRepository repository) { this.repository = repository; }
  @Transactional
  public boolean claim(String consumer, UUID eventId) {
    return repository.claim(consumer, eventId);
  }
}
