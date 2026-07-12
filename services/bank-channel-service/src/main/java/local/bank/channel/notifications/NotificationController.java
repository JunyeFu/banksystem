package local.bank.channel.notifications;

import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class NotificationController {
  private final JdbcTemplate jdbc;
  public NotificationController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @GetMapping("/api/customer/v1/notifications")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){
    var rows=jdbc.query("SELECT notification_id,notification_type,payload,read_at,created_at FROM notification WHERE subject=? ORDER BY created_at DESC",(rs,n)->{var m=new java.util.HashMap<String,Object>();m.put("notificationId",rs.getString(1));m.put("type",rs.getString(2));m.put("payload",rs.getString(3));m.put("readAt",rs.getObject(4));m.put("createdAt",rs.getObject(5).toString());return m;},jwt.getSubject());
    return Map.of("items",rows);
  }
}
