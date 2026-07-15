package local.bank.channel.payments;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ClearingBatchController {
  private final JdbcTemplate jdbc;

  public ClearingBatchController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @GetMapping("/api/operations/v1/clearing/batches")
  public List<Map<String, Object>> batches() {
    String sql = """
        SELECT date(c.created_at) business_date, COALESCE(t.currency,'CNY') currency,
          count(*) total_items,
          count(*) FILTER (WHERE c.status='SETTLED') settled_items,
          count(*) FILTER (WHERE c.status IN ('REJECTED','FAILED','TIMED_OUT','RETURNED')) failed_items,
          COALESCE(sum(t.amount),0) total_amount,
          min(c.created_at) started_at, max(c.updated_at) completed_at,
          CASE
            WHEN count(*) FILTER (WHERE c.status IN ('REJECTED','FAILED','TIMED_OUT','RETURNED')) > 0 THEN 'FAILED'
            WHEN count(*) FILTER (WHERE c.status IN ('PENDING','ACCEPTED')) > 0 THEN 'PROCESSING'
            ELSE 'COMPLETED'
          END batch_status
        FROM clearing_payment c LEFT JOIN transfer_order t ON t.transfer_id=c.transfer_id
        GROUP BY date(c.created_at), COALESCE(t.currency,'CNY')
        ORDER BY business_date DESC, currency
        """;
    return jdbc.query(sql, (rs, n) -> {
      Map<String, Object> item = new LinkedHashMap<>();
      String date = rs.getDate(1).toString(); String currency = rs.getString(2); String status = rs.getString(9);
      item.put("batchId", "CLR-" + date.replace("-", "") + "-" + currency); item.put("businessDate", date); item.put("status", status);
      item.put("totalItems", rs.getInt(3)); item.put("settledItems", rs.getInt(4)); item.put("failedItems", rs.getInt(5)); item.put("totalAmount", rs.getBigDecimal(6).toPlainString()); item.put("currency", currency);
      item.put("startedAt", rs.getTimestamp(7).toInstant().toString()); item.put("completedAt", "PROCESSING".equals(status) ? null : rs.getTimestamp(8).toInstant().toString()); return item;
    });
  }
}
