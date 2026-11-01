package local.bank.channel.identity;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CustomerIdentityRepository {
  private final JdbcTemplate jdbc;

  public CustomerIdentityRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public List<Long> clientIds(String subject) {
    return jdbc.query("SELECT fineract_client_id FROM customer_identity WHERE subject = ?",
        (rs, row) -> rs.getLong(1), subject);
  }
  public int deleteSubjects(String first, String second) {
    return jdbc.update("DELETE FROM customer_identity WHERE subject IN (?, ?)",first,second);
  }
  public int deleteSubject(String subject) {
    return jdbc.update("DELETE FROM customer_identity WHERE subject=?",subject);
  }
  public void bind(String subject,long clientId) {
    jdbc.update("INSERT INTO customer_identity(subject, fineract_client_id) VALUES (?, ?) ON CONFLICT (subject) DO UPDATE SET fineract_client_id = EXCLUDED.fineract_client_id",subject,clientId);
  }
  public boolean bindNewOrSame(String subject,long clientId) {
    return jdbc.update("""
        INSERT INTO customer_identity(subject,fineract_client_id) VALUES (?,?)
        ON CONFLICT (subject) DO UPDATE SET fineract_client_id=EXCLUDED.fineract_client_id
        WHERE customer_identity.fineract_client_id=EXCLUDED.fineract_client_id
        """,subject,clientId)==1;
  }
}
