package local.bank.channel;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FineractOperationsPort {
  public record JournalEntry(String transactionId, BigDecimal amount, String entryType,
                             Long coreTransactionId, String currency, Long glAccountId,
                             Integer entityType, Long entityId, boolean reversed) { }
  private final RestClient client;
  public FineractOperationsPort(FineractTransport transport) { this.client = transport.client(); }

  public boolean checkHealth() {
    try {
      client.get().uri("/actuator/health").retrieve().toBodilessEntity();
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  public LocalDate businessDate() {
    return readBusinessDate("BUSINESS_DATE");
  }

  public LocalDate cobDate() {
    return readBusinessDate("COB_DATE");
  }

  public LocalDate postingDate() {
    try {
      return businessDate();
    } catch (org.springframework.web.client.RestClientResponseException error) {
      if (error.getStatusCode().value() != 404 || error.getResponseHeaders() == null) throw error;
      String coreDate = error.getResponseHeaders().getFirst(HttpHeaders.DATE);
      if (coreDate == null) throw error;
      return java.time.ZonedDateTime.parse(coreDate, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toLocalDate();
    }
  }

  @SuppressWarnings("unchecked")
  private LocalDate readBusinessDate(String type) {
    Map<String, Object> body = client.get().uri("/api/v1/businessdate/{type}", type).retrieve().body(Map.class);
    Object rawDate = body == null ? null : body.get("date");
    if (rawDate instanceof List<?> date && date.size() == 3) {
      return LocalDate.of(((Number) date.get(0)).intValue(), ((Number) date.get(1)).intValue(), ((Number) date.get(2)).intValue());
    }
    throw new IllegalStateException("Fineract " + type + " is unavailable");
  }

  public void advanceBusinessDate(LocalDate nextDate) {
    Map<String, Object> body = Map.of(
        "date", nextDate.toString(),
        "dateFormat", "yyyy-MM-dd",
        "locale", "en",
        "type", "BUSINESS_DATE");
    client.post().uri("/api/v1/businessdate").body(body).retrieve().toBodilessEntity();
  }

  public void runJob(int jobId) {
    client.post().uri(uri -> uri.path("/api/v1/jobs/{jobId}").queryParam("command", "executeJob").build(jobId))
        .body(Map.of()).retrieve().toBodilessEntity();
  }

  public record JobRun(long version,String status,String trigger) {}
  public List<JobRun> jobHistory(int jobId) {
    Map<?,?> body=client.get().uri(uri->uri.path("/api/v1/jobs/{id}/runhistory")
        .queryParam("offset",0).queryParam("limit",200).build(jobId)).retrieve().body(Map.class);
    if(body==null||!(body.get("pageItems") instanceof List<?> items))
      throw new CoreReadModelException("Core job history is unavailable");
    return items.stream().map(x->{
      var row=(Map<?,?>)x;
      return new JobRun(((Number)row.get("version")).longValue(),String.valueOf(row.get("status")),String.valueOf(row.get("triggerType")));
    }).toList();
  }

  public long jobVersionBeforeSubmission(int jobId) {
    Map<?,?> job=client.get().uri("/api/v1/jobs/{id}",jobId).retrieve().body(Map.class);
    if(job==null||!(job.get("currentlyRunning") instanceof Boolean running))
      throw new CoreReadModelException("Core job running state is unavailable");
    if(running)throw new CoreReadModelException("Core job is already running");
    return jobHistory(jobId).stream().mapToLong(JobRun::version).max().orElse(0);
  }

  public boolean jobCompletedAfter(int jobId,long version) {
    var newer=jobHistory(jobId).stream().filter(x->x.version()>version).toList();
    if(newer.isEmpty())return false;
    if(newer.size()!=1||newer.getFirst().version()!=version+1||!"application".equalsIgnoreCase(newer.getFirst().trigger()))
      throw new CoreReadModelException("Core job history is ambiguous; no resubmission permitted");
    if(!"success".equalsIgnoreCase(newer.getFirst().status()))
      throw new CoreReadModelException("Core job has not completed successfully; no resubmission permitted");
    return true;
  }

  public void runCobBatch() { runJob(31); }

  public void postInterestOnSavings() { runJob(6); }

  public void applyAnnualFeeForSavings() { runJob(4); }

  public void payDueSavingsCharges() { runJob(8); }

  public void updateLoanArrearsAgeing() { runJob(2); }

  public void applyPenaltyToOverdueLoans() { runJob(12); }

  public void transferInterestToSavings() { runJob(14); }

  public void updateAccountingRunningBalances() { runJob(9); }

  public long ensureGlAccount(String code, String name, int type) {
    List<?> rows=client.get().uri("/api/v1/glaccounts").retrieve().body(List.class);
    var matches=rows.stream().map(x->(Map<?,?>)x).filter(x->code.equals(x.get("glCode"))).toList();
    if(matches.size()>1)throw new CoreReadModelException("GL code is ambiguous");
    if(matches.size()==1) {
      var existing=matches.getFirst();
      if(!(existing.get("type") instanceof Map<?,?> t)||!Integer.valueOf(type).equals(t.get("id")))
        throw new CoreReadModelException("GL account type differs from fixture");
      return ((Number)existing.get("id")).longValue();
    }
    Map<?,?> result=client.post().uri("/api/v1/glaccounts").body(Map.of(
        "name",name,"glCode",code,"type",type,"usage",1,"manualEntriesAllowed",false))
        .retrieve().body(Map.class);
    return ((Number)result.get("resourceId")).longValue();
  }


  public void ensureLiabilityTransferMapping() {
    long glAccountId=ensureGlAccount("BSG2002","Demo transfer suspense",2);
    List<?> mappings=client.get().uri("/api/v1/financialactivityaccounts").retrieve().body(List.class);
    var existing=mappings.stream().map(x->(Map<?,?>)x)
        .filter(x->x.get("financialActivityData") instanceof Map<?,?> a && Integer.valueOf(200).equals(a.get("id"))).toList();
    if(existing.size()>1)throw new CoreReadModelException("Liability transfer mapping is ambiguous");
    if(!existing.isEmpty()) {
      var mapped=(Map<?,?>)existing.getFirst().get("glAccountData");
      if(((Number)mapped.get("id")).longValue()!=glAccountId)
        throw new CoreReadModelException("Existing liability transfer mapping differs from fixture; preserved unchanged");
      return;
    }
    client.post().uri("/api/v1/financialactivityaccounts")
        .body(Map.of("financialActivityId",200,"glAccountId",glAccountId)).retrieve().toBodilessEntity();
  }

  public List<JournalEntry> journalEntries(){
    List<JournalEntry> entries=new java.util.ArrayList<>();
    int offset=0;
    while(true) {
      int pageOffset=offset;
      Map<?, ?> body=client.get().uri(uri->uri.path("/api/v1/journalentries").queryParam("limit",1000)
          .queryParam("offset",pageOffset).queryParam("transactionDetails",true).build()).retrieve().body(Map.class);
      if(body==null||!(body.get("pageItems") instanceof List<?> list))
        throw new CoreReadModelException("Core journal entry page is missing");
      entries.addAll(list.stream().map(x -> {
      if(!(x instanceof Map<?,?> row)) throw new CoreReadModelException("Core journal entry is invalid");
      Object kind = row.get("entryType");
      if (kind instanceof Map<?, ?> nested) kind = nested.get("value");
      Object id = row.get("transactionId");
      Object rawAmount = row.get("amount");
      if(id==null||rawAmount==null||kind==null)throw new CoreReadModelException("Core journal entry facts are missing");
      Object transaction=row.get("transactionDetails");
      Object coreId=transaction instanceof Map<?,?> details?details.get("transactionId"):null;
      Object currency=row.get("currency");
      Object currencyCode=currency instanceof Map<?,?> details?details.get("code"):null;
      return new JournalEntry(String.valueOf(id),new BigDecimal(String.valueOf(rawAmount)),String.valueOf(kind),
          coreId instanceof Number n?n.longValue():null,currencyCode==null?null:currencyCode.toString(),
          row.get("glAccountId") instanceof Number n?n.longValue():null,
          row.get("entityType") instanceof Map<?,?> e && e.get("id") instanceof Number n?n.intValue():null,
          row.get("entityId") instanceof Number n?n.longValue():null,Boolean.TRUE.equals(row.get("reversed")));
      }).toList());
      offset+=list.size();
      Object total=body.get("totalFilteredRecords");
      if(total instanceof Number number) {
        if(offset>=number.intValue())break;
        if(list.isEmpty())throw new CoreReadModelException("Core journal entry pagination is incomplete");
      } else if(list.size()<1000)break;
      else throw new CoreReadModelException("Core journal entry pagination total is missing");
    }
    return List.copyOf(entries);
  }
}
