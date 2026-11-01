package local.bank.channel.notifications;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
  private final JdbcTemplate jdbc;

  public NotificationRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public List<Notification> list(String subject) {
    return jdbc.query("SELECT notification_id,notification_type,payload,read_at,created_at FROM notification WHERE subject=? ORDER BY created_at DESC",
        (rs,n) -> new Notification(rs.getString(1), rs.getString(2), rs.getString(3),
            rs.getObject(4) != null, rs.getObject(5).toString()), subject);
  }

  public int markRead(String subject, String id) {
    return jdbc.update("UPDATE notification SET read_at=COALESCE(read_at,now()),updated_at=now() WHERE notification_id=?::uuid AND subject=?", id, subject);
  }

  public void transferSettled(String subject, String payload) {
    jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES (?,?,?,?)",
        UUID.randomUUID(),subject,"TRANSFER_SETTLED",payload);
  }
  public void seedScenario(UUID id,String subject) {
    jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES (?,?,?,?) ON CONFLICT (notification_id) DO NOTHING",
        id,subject,"SECURITY","{\"source\":\"I10_SCENARIO\"}");
  }
  public int clearScenario(String subject) {
    return jdbc.update("DELETE FROM notification WHERE subject=? AND payload LIKE '%I10_SCENARIO%'",subject);
  }

  public record Notification(String id, String type, String payload, boolean read, String createdAt) {}
}
