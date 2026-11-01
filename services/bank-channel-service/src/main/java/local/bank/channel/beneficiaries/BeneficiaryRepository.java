package local.bank.channel.beneficiaries;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class BeneficiaryRepository {
  private final JdbcTemplate jdbc;

  public BeneficiaryRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public Map<String, Object> save(String subject, String accountId, String token, String last4, String name) {
    int migrated = jdbc.update("UPDATE beneficiary SET account_token=?,account_last4=?,display_name=?,updated_at=now() WHERE subject=? AND destination_account_id=?",
        token, last4, name, subject, accountId);
    if (migrated == 0) {
      jdbc.update("INSERT INTO beneficiary(beneficiary_id,subject,account_token,account_last4,display_name,destination_account_id) VALUES (?,?,?,?,?,?) "
          + "ON CONFLICT (subject,account_token) DO UPDATE SET display_name=EXCLUDED.display_name,destination_account_id=EXCLUDED.destination_account_id,updated_at=now()",
          UUID.randomUUID(), subject, token, last4, name, accountId);
    }
    var rows = jdbc.query("SELECT beneficiary_id,account_last4,display_name,created_at FROM beneficiary WHERE subject=? AND account_token=?",
        (rs,n) -> beneficiary(rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4).toString()), subject, token);
    return rows.get(0);
  }

  public Map<String, Object> list(String subject) {
    var rows = jdbc.query("SELECT beneficiary_id,account_last4,display_name,created_at FROM beneficiary WHERE subject=? AND destination_account_id IS NOT NULL ORDER BY created_at DESC",
        (rs,n) -> beneficiary(rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4).toString()), subject);
    return Map.of("items", rows);
  }

  public Optional<String> destinationAccount(UUID beneficiaryId, String subject) {
    var rows = jdbc.query("SELECT destination_account_id FROM beneficiary WHERE beneficiary_id=? AND subject=? AND destination_account_id IS NOT NULL",
        (rs,n) -> rs.getString(1), beneficiaryId, subject);
    return rows.stream().findFirst();
  }
  public UUID saveScenario(String subject,String destinationAccountId,String token,String last4,String name,UUID beneficiaryId) {
    int migrated=jdbc.update("UPDATE beneficiary SET account_token=?,account_last4=?,display_name=?,updated_at=now() WHERE subject=? AND destination_account_id=?",
        token,last4,name,subject,destinationAccountId);
    if(migrated==0)jdbc.update("""
        INSERT INTO beneficiary(beneficiary_id,subject,account_token,account_last4,display_name,destination_account_id)
        VALUES (?,?,?,?,?,?) ON CONFLICT (subject,account_token) DO UPDATE SET display_name=EXCLUDED.display_name,
          destination_account_id=EXCLUDED.destination_account_id,updated_at=now()
        """,beneficiaryId,subject,token,last4,name,destinationAccountId);
    return jdbc.queryForObject("SELECT beneficiary_id FROM beneficiary WHERE subject=? AND account_token=?",UUID.class,subject,token);
  }
  public int clearScenario(String subject) {
    return jdbc.update("""
        DELETE FROM beneficiary b WHERE b.subject=? AND b.display_name='I10测试收款人'
        AND NOT EXISTS (SELECT 1 FROM transfer_order t WHERE t.beneficiary_id=b.beneficiary_id)
        """,subject);
  }
  public int retainedScenario(String subject) {
    Integer count=jdbc.queryForObject("""
        SELECT count(*) FROM beneficiary b WHERE b.subject=? AND b.display_name='I10测试收款人'
        AND EXISTS (SELECT 1 FROM transfer_order t WHERE t.beneficiary_id=b.beneficiary_id)
        """,Integer.class,subject);
    return count==null?0:count;
  }

  private static Map<String,Object> beneficiary(String id, String last4, String displayName, String createdAt) {
    return Map.of("beneficiaryId", id, "maskedAccountNumber", "****" + last4,
        "displayName", displayName, "createdAt", createdAt);
  }
}
