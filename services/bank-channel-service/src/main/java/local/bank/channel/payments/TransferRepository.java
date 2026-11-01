package local.bank.channel.payments;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TransferRepository {
  private static final String BASE_SELECT = """
      SELECT t.transfer_id,t.status,t.amount,t.currency,t.source_account_id,t.destination_account_id,
             t.beneficiary_id,b.display_name,b.account_last4,t.reference,t.core_reference,t.correlation_id,
             t.failure_code,t.failure_detail,t.failure_reason,t.created_at,t.updated_at,
             EXISTS(SELECT 1 FROM transfer_receipt r WHERE r.transfer_id=t.transfer_id) AS receipt_available
        FROM transfer_order t
        LEFT JOIN beneficiary b ON b.beneficiary_id=t.beneficiary_id
      """;
  private final JdbcTemplate jdbc;
  public TransferRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public Optional<IdempotentResponse> idempotentResponse(String subject, String operation, String key) {
    var rows = jdbc.query("SELECT request_hash,response_body::text,http_status FROM idempotency_record "
            + "WHERE subject=? AND operation=? AND idempotency_key=? AND expires_at>now()",
        (rs,n) -> new IdempotentResponse(rs.getString(1),rs.getString(2),rs.getInt(3)),subject,operation,key);
    return rows.stream().findFirst();
  }

  public void create(UUID transferId, String key, String scopeKey, String subject, String operation,
      String hash, String body, String source, String destination, UUID beneficiaryId,
      BigDecimal amount, String currency, String correlationId, String reference) {
    jdbc.update("INSERT INTO idempotency_record(id,idempotency_key,scope_key,subject,operation,request_hash,status,http_status,status_code,response_headers,response_body,expires_at) "
            + "VALUES (?,?,?,?,?,?,'OK',202,202,'{}'::jsonb,?::jsonb,now()+interval '24 hours')",
        UUID.randomUUID(),key,scopeKey,subject,operation,hash,body);
    jdbc.update("INSERT INTO transfer_order(transfer_id,idempotency_key,source_account_id,destination_account_id,beneficiary_id,amount,currency,status,subject,correlation_id,request_hash,reference) "
            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        transferId,scopeKey,source,destination,beneficiaryId,amount,currency,"CREATED",subject,correlationId,hash,reference);
  }

  public void createdOutbox(UUID transferId, String body) {
    jdbc.update("INSERT INTO outbox_event(id,transfer_id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,status) VALUES (?,?,?,?,?,?,?::jsonb,?::jsonb,?)",
        UUID.randomUUID(),transferId,"Transfer",transferId,"transfer.status.changed",1,body,"{}","PENDING");
  }

  public record Filter(String subject, String status, String currency, String query,
                       OffsetDateTime from, OffsetDateTime to) { }
  private record Query(String where, List<Object> parameters) { }
  private Query query(Filter filter) {
    List<String> predicates=new ArrayList<>();
    List<Object> parameters=new ArrayList<>();
    if(filter.subject()!=null){predicates.add("t.subject=?");parameters.add(filter.subject());}
    if(filter.status()!=null){predicates.add("t.status=?");parameters.add(filter.status());}
    if(filter.currency()!=null){predicates.add("t.currency=?");parameters.add(filter.currency());}
    if(filter.query()!=null){
      predicates.add("(CAST(t.transfer_id AS text) ILIKE ? OR t.core_reference ILIKE ? OR t.correlation_id ILIKE ?)");
      String pattern="%"+filter.query().replace("%","\\%").replace("_","\\_")+"%";
      parameters.add(pattern);parameters.add(pattern);parameters.add(pattern);
    }
    if(filter.from()!=null){predicates.add("t.created_at>=?");parameters.add(filter.from());}
    if(filter.to()!=null){predicates.add("t.created_at<=?");parameters.add(filter.to());}
    return new Query(predicates.isEmpty()?"":" WHERE "+String.join(" AND ",predicates),parameters);
  }
  public List<Map<String,Object>> exportRows(Filter filter) {
    Query query=query(filter);
    return jdbc.query(BASE_SELECT + query.where() + " ORDER BY t.created_at DESC LIMIT 10000",this::transferRow,query.parameters().toArray());
  }

  public Optional<Map<String,Object>> findCustomer(UUID id, String subject) {
    return jdbc.query(BASE_SELECT + " WHERE t.transfer_id=? AND t.subject=?",this::transferRow,id,subject).stream().findFirst();
  }

  public boolean owned(UUID id, String subject) {
    return !jdbc.query("SELECT 1 FROM transfer_order WHERE transfer_id=? AND subject=?",
        (rs,n) -> rs.getInt(1),id,subject).isEmpty();
  }

  public Optional<Map<String,Object>> findOperations(UUID id) {
    return jdbc.query(BASE_SELECT + " WHERE t.transfer_id=?",this::transferRow,id).stream().findFirst();
  }

  public List<Map<String,Object>> history(UUID id) {
    return jdbc.query("SELECT from_status,to_status,reason_code,actor_type,actor_id,created_at FROM transfer_state_history WHERE transfer_id=? ORDER BY id",
        (rs,n) -> nullableMap("fromStatus",rs.getString(1),"toStatus",rs.getString(2),"reasonCode",rs.getString(3),
            "actorType",rs.getString(4),"actorId",rs.getString(5),"createdAt",rs.getObject(6).toString()),id);
  }

  public List<Map<String,Object>> outboxEvents(UUID id) {
    return jdbc.query("SELECT id,event_type,status,attempt_count,published_at,created_at,updated_at FROM outbox_event WHERE aggregate_id=? ORDER BY created_at",
        (rs,n) -> nullableMap("eventId",rs.getString(1),"eventType",rs.getString(2),"status",rs.getString(3),
            "attemptCount",rs.getInt(4),"publishedAt",rs.getObject(5),"createdAt",rs.getObject(6).toString(),
            "updatedAt",rs.getObject(7).toString()),id);
  }

  public int auditCount(UUID id) {
    Integer count = jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE resource_id=?",Integer.class,id.toString());
    return count == null ? 0 : count;
  }

  public Map<String,Object> page(Filter filter, int page, int size) {
    Query query=query(filter);String where=query.where();List<Object> parameters=query.parameters();
    Long total = jdbc.queryForObject("SELECT count(*) FROM transfer_order t" + where,Long.class,parameters.toArray());
    List<Object> args = new ArrayList<>(parameters);
    args.add(size); args.add(page*size);
    var rows = jdbc.query(BASE_SELECT + where + " ORDER BY t.created_at DESC LIMIT ? OFFSET ?",this::transferRow,args.toArray());
    long count = total == null ? 0L : total;
    return Map.of("items",rows,"page",page,"size",size,"totalItems",count,
        "totalPages",count==0?0:(count+size-1)/size);
  }

  public Map<String,Object> summary(Filter filter) {
    Query query=query(filter);String where=query.where();List<Object> parameters=query.parameters();
    return jdbc.queryForObject("SELECT count(*),count(*) FILTER (WHERE t.status='SETTLED'),"
            + "count(*) FILTER (WHERE t.status IN ('CREATED','VALIDATING','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING'))," + "count(*) FILTER (WHERE t.status='RISK_REVIEW'),"
            + "count(*) FILTER (WHERE t.status IN ('FAILED','TIMED_OUT','RETURNED','REVERSED')) FROM transfer_order t" + where,
        (rs,n) -> Map.of("total",rs.getLong(1),"settled",rs.getLong(2),"processing",rs.getLong(3),
            "riskReview",rs.getLong(4),"failed",rs.getLong(5)),parameters.toArray());
  }

  public int pendingForEod() {
    Integer count = jdbc.queryForObject("""
        SELECT count(*) FROM transfer_order
         WHERE status IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING',
           'PENDING_CLEARING','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING')
        """,Integer.class);
    return count == null ? 0 : count;
  }

  private Map<String,Object> transferRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String,Object> row = new LinkedHashMap<>();
    row.put("transferId",rs.getString(1)); row.put("status",rs.getString(2));
    row.put("amount",rs.getBigDecimal(3).toPlainString()); row.put("currency",rs.getString(4));
    row.put("sourceAccountId",rs.getString(5)); row.put("destinationAccountId",rs.getString(6));
    putIfPresent(row,"beneficiaryId",rs.getString(7)); putIfPresent(row,"beneficiaryName",rs.getString(8));
    String last4 = rs.getString(9); if(last4!=null)row.put("maskedDestinationAccount","****"+last4);
    putIfPresent(row,"reference",rs.getString(10)); putIfPresent(row,"coreReference",rs.getString(11));
    putIfPresent(row,"correlationId",rs.getString(12)); putIfPresent(row,"failureCode",rs.getString(13));
    String detail = rs.getString(14); if(detail==null)detail=rs.getString(15);
    putIfPresent(row,"failureDetail",detail);
    row.put("createdAt",rs.getObject(16).toString()); row.put("updatedAt",rs.getObject(17).toString());
    row.put("receiptAvailable",rs.getBoolean(18)); return row;
  }

  private static Map<String,Object> nullableMap(Object... entries) {
    Map<String,Object> result = new LinkedHashMap<>();
    for(int i=0;i<entries.length;i+=2)if(entries[i+1]!=null)result.put((String)entries[i],entries[i+1]);
    return result;
  }

  private static void putIfPresent(Map<String,Object> target,String key,String value) {
    if(value!=null&&!value.isBlank())target.put(key,value);
  }

  public record IdempotentResponse(String hash, String body, int status) {}
}
