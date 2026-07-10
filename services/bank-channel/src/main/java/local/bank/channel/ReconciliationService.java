package local.bank.channel;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReconciliationService {
  private final JdbcTemplate jdbc;
  public ReconciliationService(JdbcTemplate jdbc){this.jdbc=jdbc;}

  @Transactional
  public Map<String,Object> run(String type){
    if(!java.util.Set.of("CHANNEL_TO_CORE","CHANNEL_TO_CLEARING","CORE_TO_GENERAL_LEDGER").contains(type)) throw new IllegalArgumentException("Unsupported reconciliation type");
    int differences;
    String details;
    if(type.equals("CHANNEL_TO_CORE")) {
      differences=jdbc.queryForObject("SELECT count(*) FROM transfer WHERE status='POSTED' AND (core_reference IS NULL OR core_reference='')",Integer.class);
      details=differences==0?"Every posted channel transfer has a Fineract reference":"Posted transfer is missing a Fineract reference";
    } else if(type.equals("CHANNEL_TO_CLEARING")) {
      differences=jdbc.queryForObject("SELECT count(*) FROM clearing_payment c LEFT JOIN transfer t ON t.transfer_id=c.transfer_id WHERE c.status='SETTLED' AND (t.transfer_id IS NULL OR t.status NOT IN ('POSTED','SETTLED'))",Integer.class);
      details=differences==0?"Clearing settlement statuses are aligned":"Clearing settlement differs from channel transfer status";
    } else {
      differences=jdbc.queryForObject("SELECT count(*) FROM transfer WHERE status IN ('POSTED','SETTLED') AND (core_reference IS NULL OR core_reference='')",Integer.class);
      details=differences==0?"Core reference invariant holds":"Core reference invariant failed";
    }
    UUID id=UUID.randomUUID();String status=differences==0?"MATCHED":"DIFFERENCE";
    jdbc.update("INSERT INTO reconciliation_run(run_id,reconciliation_type,status,difference_count,details) VALUES(?,?,?,?,?)",id,type,status,differences,details);
    return Map.of("runId",id.toString(),"type",type,"status",status,"differenceCount",differences,"details",details);
  }

  public Map<String,Object> latest(){
    var rows=jdbc.query("SELECT run_id,reconciliation_type,status,difference_count,details FROM reconciliation_run ORDER BY created_at DESC LIMIT 1",(rs,n)->Map.<String,Object>of("runId",rs.getString(1),"type",rs.getString(2),"status",rs.getString(3),"differenceCount",rs.getInt(4),"details",rs.getString(5)));
    return rows.isEmpty()?Map.of("status","NOT_STARTED"):rows.get(0);
  }
}
