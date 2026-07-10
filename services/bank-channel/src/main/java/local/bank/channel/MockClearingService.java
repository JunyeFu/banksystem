package local.bank.channel;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class MockClearingService {
  private final JdbcTemplate jdbc;
  private final String secret;
  public MockClearingService(JdbcTemplate jdbc, @Value("${clearing.callback-secret:local-only-change-me}") String secret) { this.jdbc = jdbc; this.secret = secret; }

  @Transactional
  public Map<String,Object> submit(UUID transferId, String scenario, String key) {
    if (!java.util.Set.of("SUCCESS", "TIMEOUT", "DUPLICATE", "OUT_OF_ORDER", "RETURNED").contains(scenario)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported clearing scenario");
    var found = jdbc.query("SELECT clearing_id,status FROM clearing_payment WHERE idempotency_key=?", (rs,n)->Map.<String,Object>of("id",rs.getString(1),"status",rs.getString(2)), key);
    if (!found.isEmpty()) return Map.of("clearingId", found.get(0).get("id"), "status", found.get(0).get("status"));
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO clearing_payment(clearing_id,idempotency_key,transfer_id,scenario,status) VALUES (?,?,?,?,?)", id, key, transferId, scenario, "PENDING");
    return Map.of("clearingId", id.toString(), "status", "PENDING", "scenario", scenario);
  }

  @Transactional
  public Map<String,Object> deliver(UUID clearingId, int sequence) {
    var rows=jdbc.query("SELECT scenario,delivery_count,last_sequence FROM clearing_payment WHERE clearing_id=? FOR UPDATE",(rs,n)->{var m=new java.util.HashMap<String,Object>();m.put("scenario",rs.getString(1));m.put("count",rs.getInt(2));m.put("last",(Integer)rs.getObject(3));return m;},clearingId);
    if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Clearing payment not found");
    Map<String,Object> row=rows.get(0); int count=(Integer)row.get("count")+1; int previous=row.get("last")==null?0:(Integer)row.get("last");
    String status="SUCCESS".equals(row.get("scenario"))?"SETTLED":("TIMEOUT".equals(row.get("scenario"))?"TIMED_OUT":("RETURNED".equals(row.get("scenario"))?"RETURNED":"CALLBACK_RECEIVED"));
    boolean duplicate=sequence<=previous; boolean outOfOrder=sequence>previous+1;
    if(!duplicate) jdbc.update("UPDATE clearing_payment SET delivery_count=?,last_sequence=?,status=? WHERE clearing_id=?",count,sequence,status,clearingId);
    String signature=sign(clearingId+":"+sequence+":"+status);
    return Map.of("clearingId",clearingId.toString(),"status",duplicate?"DUPLICATE_IGNORED":status,"signature",signature,"deliveryCount",count,"outOfOrder",outOfOrder);
  }
  private String sign(String value){try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
