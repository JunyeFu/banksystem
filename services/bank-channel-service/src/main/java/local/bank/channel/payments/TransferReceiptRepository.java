package local.bank.channel.payments;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TransferReceiptRepository {
  private final JdbcTemplate jdbc;
  public TransferReceiptRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public Optional<Map<String,Object>> find(UUID transferId, String subject) {
    var rows = jdbc.query("SELECT receipt_id,payload,sha256,created_at FROM transfer_receipt WHERE transfer_id=? AND subject=?",
        (rs,n) -> Map.<String,Object>of("receiptId",rs.getString(1),"payload",rs.getString(2),
            "sha256",rs.getString(3),"createdAt",rs.getObject(4).toString()),transferId,subject);
    return rows.stream().findFirst();
  }

  public void insert(UUID transferId, String subject, String payload, String hash) {
    jdbc.update("INSERT INTO transfer_receipt(receipt_id,transfer_id,subject,payload,sha256) VALUES (?,?,?,?,?) ON CONFLICT (transfer_id) DO NOTHING",
        UUID.randomUUID(),transferId,subject,payload,hash);
  }
}
