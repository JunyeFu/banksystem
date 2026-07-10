package local.bank.channel;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TransferProcessor {
  private final JdbcTemplate jdbc;
  private final FineractAdapter fineract;
  public TransferProcessor(JdbcTemplate jdbc, FineractAdapter fineract) { this.jdbc = jdbc; this.fineract = fineract; }

  @Transactional
  public Map<String, Object> process(UUID transferId) {
    var rows = jdbc.query("SELECT source_account_id,destination_account_id,amount,currency,status,idempotency_key,subject FROM transfer WHERE transfer_id = ? FOR UPDATE", (rs, n) -> {var m=new java.util.HashMap<String,Object>();m.put("source",rs.getString(1));m.put("destination",rs.getString(2));m.put("amount",rs.getBigDecimal(3));m.put("currency",rs.getString(4));m.put("status",rs.getString(5));m.put("key",rs.getString(6));m.put("subject",rs.getString(7));return m;}, transferId);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transfer not found");
    Map<String,Object> row = rows.get(0);
    if (!"RECEIVED".equals(row.get("status"))) return Map.of("transferId", transferId.toString(), "status", row.get("status"));
    jdbc.update("UPDATE transfer SET status='PROCESSING' WHERE transfer_id=?", transferId);
    Map<String,Object> core;
    try {
      core = fineract.accountTransfer(Long.parseLong((String) row.get("source")), Long.parseLong((String) row.get("destination")), (BigDecimal) row.get("amount"), (String) row.get("currency"), (String) row.get("key"));
    } catch (RuntimeException ex) {
      String rawReason = ex instanceof org.springframework.web.client.HttpClientErrorException http
          ? http.getStatusCode()+" "+http.getResponseBodyAsString() : ex.getMessage();
      String reason = rawReason == null ? "Core transfer rejected" : rawReason.substring(0, Math.min(240, rawReason.length()));
      jdbc.update("UPDATE transfer SET status='FAILED', failure_reason=? WHERE transfer_id=?", reason, transferId);
      jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)", UUID.randomUUID(), transferId, "transfer.status.changed", "{\"transferId\":\"" + transferId + "\",\"status\":\"FAILED\"}");
      return Map.of("transferId", transferId.toString(), "status", "FAILED", "failureReason", reason);
    }
    String reference = String.valueOf(core == null ? "" : core.getOrDefault("resourceId", core.getOrDefault("id", "")));
    jdbc.update("UPDATE transfer SET status='POSTED', core_reference=? WHERE transfer_id=?", reference, transferId);
    jdbc.update("INSERT INTO transfer_outbox(event_id,transfer_id,event_type,payload) VALUES (?,?,?,?)", UUID.randomUUID(), transferId, "transfer.status.changed", "{\"transferId\":\"" + transferId + "\",\"status\":\"POSTED\"}");
    String receiptPayload="{\"transferId\":\""+transferId+"\",\"amount\":\""+row.get("amount")+"\",\"currency\":\""+row.get("currency")+"\",\"status\":\"POSTED\",\"coreReference\":\""+reference+"\"}";
    String receiptHash=sha256(receiptPayload);
    if(row.get("subject")!=null){
      jdbc.update("INSERT INTO transfer_receipt(receipt_id,transfer_id,subject,payload,sha256) VALUES (?,?,?,?,?) ON CONFLICT (transfer_id) DO NOTHING",UUID.randomUUID(),transferId,(String)row.get("subject"),receiptPayload,receiptHash);
      jdbc.update("INSERT INTO notification(notification_id,subject,notification_type,payload) VALUES (?,?,?,?)",UUID.randomUUID(),(String)row.get("subject"),"TRANSFER_SETTLED",receiptPayload);
    }
    return Map.of("transferId", transferId.toString(), "status", "POSTED", "coreReference", reference);
  }

  private static String sha256(String input){try{var d=java.security.MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));return java.util.HexFormat.of().formatHex(d);}catch(Exception e){throw new IllegalStateException(e);}}
}
