package local.bank.channel.payments;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class InboxRepository {
  private final JdbcTemplate jdbc;
  public InboxRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public boolean claim(String consumer, UUID eventId) {
    return jdbc.update("INSERT INTO inbox_event(consumer_name,event_id) VALUES (?,?) ON CONFLICT DO NOTHING",
        consumer, eventId) == 1;
  }
}
