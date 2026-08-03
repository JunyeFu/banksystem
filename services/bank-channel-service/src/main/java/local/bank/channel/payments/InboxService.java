package local.bank.channel.payments;

import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InboxService {
  private final JdbcTemplate jdbc;
  public InboxService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  @Transactional
  public boolean claim(String consumer, UUID eventId) {
    try {
      jdbc.update("INSERT INTO inbox_event(consumer_name,event_id) VALUES (?,?)", consumer, eventId);
      return true;
    } catch (DuplicateKeyException duplicate) {
      return false;
    }
  }
}
