package local.bank.channel.notifications;

import java.util.Map;
import java.util.LinkedHashMap;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class NotificationController {
  private final NotificationRepository repository;
  public NotificationController(NotificationRepository repository){this.repository=repository;}
  @GetMapping("/api/customer/v1/notifications")
  public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt){
    var rows=repository.list(jwt.getSubject()).stream().map(notification -> {
      var item=new LinkedHashMap<String,Object>();
      String type=notification.type();
      item.put("messageId",notification.id());
      item.put("subject",title(type));
      item.put("body",safeBody(type,notification.payload()));
      item.put("read",notification.read());
      item.put("createdDate",notification.createdAt());
      return item;
    }).toList();
    return Map.of("items",rows);
  }

  @PostMapping("/api/customer/v1/notifications/{notificationId}/read")
  public Map<String,Object> markRead(@AuthenticationPrincipal Jwt jwt,@PathVariable String notificationId){
    int changed=repository.markRead(jwt.getSubject(),notificationId);
    if(changed==0)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Notification is not linked");
    return Map.of("messageId",notificationId,"read",true);
  }

  private static String title(String type){
    if(type==null)return "系统消息";
    return switch(type.toUpperCase(java.util.Locale.ROOT)){
      case "TRANSFER_ACCEPTED","TRANSFER_SETTLED" -> "转账受理通知";
      case "LOGIN" -> "登录提醒";
      case "LOAN_REPAYMENT" -> "还款提醒";
      case "SECURITY" -> "安全提醒";
      default -> "系统公告";
    };
  }

  private static String safeBody(String type,String payload){
    return title(type)+"已生成，请登录复兴银行客户门户查看详情。";
  }
}
