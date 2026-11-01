package local.bank.channel.customerprofile;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class LoanRepository {
  private final JdbcTemplate jdbc;

  public LoanRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public void createDraft(UUID id, String subject, BigDecimal amount, int termMonths, String purpose,
      String repaymentMethod, String note, BigDecimal quotedRate) {
    jdbc.update("""
        INSERT INTO loan_application(application_id,subject,requested_amount,term_months,purpose,status,
          repayment_method,customer_note,quoted_annual_interest_rate)
        VALUES (?,?,?,?,?,'DRAFT',?,?,?)
        """, id, subject, amount, termMonths, purpose, repaymentMethod, note, quotedRate);
  }

  public int submit(String subject, UUID id, long version) {
    return jdbc.update("""
        UPDATE loan_application SET status='SUBMITTED',version=version+1,updated_at=now()
        WHERE application_id=? AND subject=? AND status='DRAFT' AND version=?
        """, id, subject, version);
  }

  public int score(UUID id, long version, int score, String reason) {
    return jdbc.update("""
        UPDATE loan_application SET score=?,scoring_reason=?,status='SCORED',version=version+1,updated_at=now()
        WHERE application_id=? AND status='SUBMITTED' AND version=?
        """, score, reason, id, version);
  }

  public int requestApproval(UUID approvalId, UUID id, String maker, long version, String reason) {
    return jdbc.update("""
        INSERT INTO loan_approval(approval_id,application_id,maker_subject,status,reason,application_version)
        SELECT ?,application_id,?,'PENDING',?,version FROM loan_application
        WHERE application_id=? AND status='SCORED' AND version=?
        """, approvalId, maker, reason, id, version);
  }

  public Approval lockApproval(UUID id) {
    List<Approval> rows = jdbc.query("""
        SELECT approval_id,application_id,maker_subject,status,version,application_version
        FROM loan_approval WHERE approval_id=? FOR UPDATE
        """, (rs, n) -> new Approval((UUID) rs.getObject(1), (UUID) rs.getObject(2), rs.getString(3),
        rs.getString(4), rs.getLong(5), rs.getLong(6)), id);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Approval not found");
    return rows.get(0);
  }

  public int approve(UUID id, String checker, long version, String reason) {
    return jdbc.update("""
        UPDATE loan_approval SET checker_subject=?,status='APPROVED',reason=?,version=version+1
        WHERE approval_id=? AND status='PENDING' AND version=? AND maker_subject<>?
        """, checker, reason, id, version, checker);
  }

  public int approveApplication(UUID id, long version, BigDecimal amount, BigDecimal rate) {
    return jdbc.update("""
        UPDATE loan_application SET status='APPROVED',approved_amount=?,approved_annual_interest_rate=?,
          version=version+1,updated_at=now()
        WHERE application_id=? AND status='SCORED' AND version=?
        """, amount, rate, id, version);
  }

  public boolean claimCoreKey(UUID id, String key) {
    return jdbc.update("""
        UPDATE loan_application SET core_idempotency_key=?,version=version+1,updated_at=now()
        WHERE application_id=? AND status='APPROVED' AND core_loan_id IS NULL AND core_idempotency_key IS NULL
        """, key, id)==1;
  }

  public int recordCoreLoan(UUID id, String key, long coreId) {
    return jdbc.update("""
        UPDATE loan_application SET core_loan_id=?,status='CORE_SUBMITTED',version=version+1,updated_at=now()
        WHERE application_id=? AND status='APPROVED' AND core_loan_id IS NULL AND core_idempotency_key=?
        """, coreId, id, key);
  }

  public void addDocument(UUID documentId, UUID applicationId, String subject, String type, String ref) {
    jdbc.update("""
        INSERT INTO loan_document(document_id,application_id,subject,document_type,storage_ref)
        VALUES (?,?,?,?,?)
        """, documentId, applicationId, subject, type, ref);
  }

  public List<Map<String, Object>> documents(String subject, UUID applicationId) {
    return jdbc.query("""
        SELECT document_id,application_id,document_type,status,created_at
        FROM loan_document WHERE application_id=? AND subject=? ORDER BY created_at,document_id
        """, (rs, n) -> Map.of("documentId", rs.getString(1), "applicationId", rs.getString(2),
        "documentType", rs.getString(3), "status", rs.getString(4), "createdAt", rs.getObject(5).toString()),
        applicationId, subject);
  }

  public List<Application> customerApplications(String subject) {
    return applications("WHERE subject=? ORDER BY created_at DESC", subject);
  }

  public List<Application> operationsApplications() {
    return applications("ORDER BY created_at DESC");
  }

  public Application application(UUID id, String subject) {
    List<Application> rows = subject == null
        ? applications("WHERE application_id=?", id)
        : applications("WHERE application_id=? AND subject=?", id, subject);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found");
    return rows.get(0);
  }

  private List<Application> applications(String suffix, Object... args) {
    return jdbc.query("""
        SELECT application_id,subject,requested_amount,term_months,purpose,status,core_loan_id,
          core_idempotency_key,score,scoring_reason,version,repayment_method,customer_note,
          quoted_annual_interest_rate,approved_annual_interest_rate,approved_amount,created_at,updated_at
        FROM loan_application %s
        """.formatted(suffix), (rs, n) -> new Application((UUID) rs.getObject(1), rs.getString(2),
        rs.getBigDecimal(3), rs.getInt(4), rs.getString(5), rs.getString(6), (Long) rs.getObject(7),
        rs.getString(8), (Integer) rs.getObject(9), rs.getString(10), rs.getLong(11), rs.getString(12),
        rs.getString(13), rs.getBigDecimal(14), rs.getBigDecimal(15), rs.getBigDecimal(16),
        rs.getObject(17).toString(), rs.getObject(18).toString()), args);
  }

  public List<Map<String, Object>> documentsForOperations(UUID id) {
    return jdbc.query("""
        SELECT document_id,document_type,status,created_at FROM loan_document
        WHERE application_id=? ORDER BY created_at,document_id
        """, (rs, n) -> Map.of("documentId", rs.getString(1), "documentType", rs.getString(2),
        "status", rs.getString(3), "createdAt", rs.getObject(4).toString()), id);
  }

  public List<Map<String, Object>> approvalsForOperations(UUID id) {
    return jdbc.query("""
        SELECT approval_id,maker_subject,checker_subject,status,reason,version,application_version
        FROM loan_approval WHERE application_id=? ORDER BY approval_id
        """, (rs, n) -> {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("approvalId", rs.getString(1));
      item.put("makerSubject", rs.getString(2));
      if (rs.getString(3) != null) item.put("checkerSubject", rs.getString(3));
      item.put("status", rs.getString(4));
      item.put("reason", rs.getString(5));
      item.put("version", rs.getLong(6));
      item.put("applicationVersion", rs.getLong(7));
      return item;
    }, id);
  }

  public Long coreLoanFor(String subject, UUID id) {
    var rows = jdbc.query("SELECT core_loan_id FROM loan_application WHERE application_id=? AND subject=?",
        (rs, n) -> (Long) rs.getObject(1), id, subject);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found");
    if (rows.get(0) == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Core loan has not been submitted");
    return rows.get(0);
  }

  public void closeApplication(UUID id) {
    jdbc.update("UPDATE loan_application SET status='CLOSED',version=version+1,updated_at=now() WHERE application_id=?", id);
  }

  public record Approval(UUID id, UUID applicationId, String maker, String status, long version, long applicationVersion) {}
  public record Application(UUID id, String subject, BigDecimal requestedAmount, int termMonths, String purpose,
      String status, Long coreLoanId, String coreIdempotencyKey, Integer score, String scoringReason, long version,
      String repaymentMethod, String customerNote, BigDecimal quotedAnnualInterestRate,
      BigDecimal approvedAnnualInterestRate, BigDecimal approvedAmount, String createdAt, String updatedAt) {}
}
