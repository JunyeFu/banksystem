package local.bank.channel.reconciliation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.FineractOperationsPort;
import local.bank.channel.FineractAccountPort;
import local.bank.channel.reconciliation.ReconciliationRepository.TransferFact;
import local.bank.channel.reconciliation.ReconciliationRepository.Difference;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ReconciliationService {
  private static final Set<String> TYPES = Set.of(
      "CHANNEL_TO_CORE", "CHANNEL_TO_CLEARING", "CORE_TO_GENERAL_LEDGER");

  private final ReconciliationRepository repository;
  private final FineractTransferPort fineract;
  private final ObjectMapper mapper;
  private final TransactionTemplate transactions;
  private final FineractOperationsPort operations;
  private final FineractAccountPort accounts;

  public ReconciliationService(ReconciliationRepository repository, FineractTransferPort fineract, ObjectMapper mapper,
                               PlatformTransactionManager transactionManager,FineractOperationsPort operations,FineractAccountPort accounts) {
    this.repository = repository;
    this.fineract = fineract;
    this.mapper = mapper;
    this.transactions = new TransactionTemplate(transactionManager);
    this.operations = operations;
    this.accounts = accounts;
  }

  public Map<String, Object> run(String type) {
    return run(type, null, null, "MANUAL");
  }

  public Map<String, Object> runForEod(String type, UUID eodRunId, LocalDate businessDate) {
    return runForEod(type, eodRunId, businessDate, "PRE");
  }

  public Map<String, Object> runForEod(String type, UUID eodRunId, LocalDate businessDate, String phase) {
    var existing=repository.forEod(eodRunId,type,phase);
    return existing.isEmpty() ? run(type,eodRunId,businessDate,phase)
        : result(existing.get(0).id(),existing.get(0).type(),existing.get(0).status(),existing.get(0).count(),existing.get(0).details(),correlationId());
  }

  Map<String, Object> run(String type, UUID eodRunId, LocalDate businessDate, String phase) {
    if (!TYPES.contains(type)) throw new IllegalArgumentException("Unsupported reconciliation type");
    Map<String,Object> coverage=new LinkedHashMap<>();
    List<Difference> differences = switch (type) {
      case "CHANNEL_TO_CORE" -> channelToCore();
      case "CHANNEL_TO_CLEARING" -> channelToClearing();
      case "CORE_TO_GENERAL_LEDGER" -> coreToGeneralLedger(coverage);
      default -> throw new IllegalArgumentException("Unsupported reconciliation type");
    };
    UUID runId = UUID.randomUUID();
    String status = differences.isEmpty() ? "MATCHED" : "DIFFERENCE";
    String message = differences.isEmpty()
        ? type + " matched transaction, reference, amount and currency facts"
        : type + " found " + differences.size() + " field differences";
    coverage.put("correlationId",correlationId());
    coverage.put("message",message);coverage.put("differenceCount",differences.size());
    String details = json(coverage);
    transactions.executeWithoutResult(tx -> {
      repository.create(runId,type,status,differences.size(),details,eodRunId,businessDate,phase);
      for (Difference difference : differences) repository.difference(runId,difference);
    });
    return result(runId, type, status, differences.size(), details, correlationId());
  }

  private List<Difference> channelToCore() {
    List<Difference> differences = new ArrayList<>();
    for (TransferFact transfer : repository.transferFacts()) {
      if (transfer.coreReference() == null) {
        differences.add(new Difference(transfer.id(), "reference", "Fineract transfer id", null));
        continue;
      }
      try {
        Optional<FineractTransferPort.VerifiedTransfer> core = fineract.findAccountTransfer(
            transfer.idempotencyKey(), transfer.coreReference(), transfer.sourceAccountId(),
            transfer.destinationAccountId(), transfer.amount(), transfer.currency());
        if (core.isEmpty()) differences.add(new Difference(transfer.id(), "transaction", "present", "missing"));
      } catch (RuntimeException mismatch) {
        differences.add(new Difference(transfer.id(), "coreTransferFacts",
            transfer.expectedSummary(), mismatch.getMessage()));
      }
    }
    return differences;
  }

  private List<Difference> channelToClearing() {
    return repository.clearingFacts().stream().map(fact -> {
      UUID id=fact.id();
      List<Difference> row = new ArrayList<>();
      String clearingStatus=fact.clearingStatus();
      boolean statusMatches = "SETTLED".equals(clearingStatus)
          ? Set.of("SETTLED", "RETURNED", "REVERSED").contains(fact.transferStatus())
          : Set.of("RETURNED", "REVERSED").contains(fact.transferStatus());
      if (!statusMatches) row.add(new Difference(id, "status", clearingStatus, fact.transferStatus()));
      compare(row,id,"reference",fact.transferReference(),fact.clearingReference());
      compare(row,id,"amount",decimal(fact.transferAmount()),decimal(fact.clearingAmount()));
      compare(row,id,"currency",fact.transferCurrency(),fact.clearingCurrency());
      return row;
    }).flatMap(List::stream).toList();
  }

  private List<Difference> coreToGeneralLedger(Map<String,Object> coverage) {
    List<Difference> differences = channelToCore();
    var entries=operations.journalEntries();
    var views=new java.util.HashMap<Long,FineractAccountPort.SavingsLedgerView>();
    int checked=0,legacy=0;
    for(var transfer:repository.transferFacts()) {
      var source=views.computeIfAbsent(transfer.sourceAccountId(),accounts::ledgerView);
      var target=views.computeIfAbsent(transfer.destinationAccountId(),accounts::ledgerView);
      if(source.accountingRule()==1&&target.accountingRule()==1){legacy++;continue;}
      if(source.accountingRule()!=2||target.accountingRule()!=2) {
        differences.add(new Difference(transfer.id(),"accountingRule","cash accounting on both legs","unsupported or mixed"));
        continue;
      }
      checked++;
      verifyLedgerLeg(differences,transfer,source,"DEBIT",entries);
      verifyLedgerLeg(differences,transfer,target,"CREDIT",entries);
    }
    coverage.put("accountingScope","CASH_ACCOUNTING_TRANSFER_LEGS");
    coverage.put("verifiedScopeTransfers",checked);coverage.put("excludedLegacyTransfers",legacy);
    if(checked==0&&!repository.transferFacts().isEmpty())
      differences.add(new Difference(null,"coreGeneralLedger","cash-accounting transfer evidence","no covered transfers"));
    for(var fact:repository.ledgerFacts()) {
      compare(differences,fact.id(),"debit",decimal(fact.amount()),decimal(fact.debit()));
      compare(differences,fact.id(),"credit",decimal(fact.amount()),decimal(fact.credit()));
      if(fact.entries()!=2)differences.add(new Difference(fact.id(),"ledgerEntries","2",String.valueOf(fact.entries())));
    }
    return differences;
  }

  private void verifyLedgerLeg(List<Difference> differences,TransferFact transfer,
      FineractAccountPort.SavingsLedgerView view,String direction,List<FineractOperationsPort.JournalEntry> entries) {
    var legs=view.transfers().stream().filter(x->java.util.Objects.equals(x.transferId(),transfer.coreReference())).toList();
    if(legs.size()!=1) {
      differences.add(new Difference(transfer.id(),"coreTransferLeg",direction+":one",String.valueOf(legs.size())));return;
    }
    var leg=legs.getFirst();
    compare(differences,transfer.id(),"legAmount",decimal(transfer.amount()),decimal(leg.amount()));
    compare(differences,transfer.id(),"legCurrency",transfer.currency(),leg.currency());
    compare(differences,transfer.id(),"legDirection",direction,leg.direction());
    var journal=entries.stream().filter(x->java.util.Objects.equals(x.coreTransactionId(),leg.transactionId())
        &&java.util.Objects.equals(x.currency(),leg.currency()) && !x.reversed()
        &&Integer.valueOf(2).equals(x.entityType())
        &&java.util.Objects.equals(x.entityId(),direction.equals("DEBIT")?transfer.sourceAccountId():transfer.destinationAccountId())).toList();
    BigDecimal debit=BigDecimal.ZERO,credit=BigDecimal.ZERO;
    for(var entry:journal) {
      if("DEBIT".equalsIgnoreCase(entry.entryType()))debit=debit.add(entry.amount());
      else if("CREDIT".equalsIgnoreCase(entry.entryType()))credit=credit.add(entry.amount());
      else throw new IllegalStateException("Unsupported core journal direction");
    }
    compare(differences,transfer.id(),"coreDebit",decimal(transfer.amount()),decimal(debit));
    compare(differences,transfer.id(),"coreCredit",decimal(transfer.amount()),decimal(credit));
    long control=journal.stream().filter(x->java.util.Objects.equals(x.glAccountId(),view.controlAccountId())
        &&direction.equalsIgnoreCase(x.entryType())&&transfer.amount().compareTo(x.amount())==0).count();
    if(control!=1)differences.add(new Difference(transfer.id(),"controlGlPosting",direction+":one",String.valueOf(control)));
  }

  private static void compare(List<Difference> target, UUID id, String field, String expected, String actual) {
    if (!java.util.Objects.equals(expected, actual)) target.add(new Difference(id, field, expected, actual));
  }

  private static String decimal(BigDecimal value) {
    return value == null ? null : value.stripTrailingZeros().toPlainString();
  }

  private String json(Map<String, Object> value) {
    try { return mapper.writeValueAsString(value); }
    catch (JsonProcessingException e) { throw new IllegalStateException(e); }
  }

  private static String correlationId() {
    String value = MDC.get("correlationId");
    return value == null ? "no-correlation" : value;
  }

  private static Map<String, Object> result(UUID id, String type, String status, int count,
                                             String details, String correlationId) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("runId", id.toString());
    result.put("type", type);
    result.put("status", status);
    result.put("differenceCount", count);
    result.put("details", details);
    result.put("correlationId", correlationId);
    return result;
  }

  public Map<String, Object> latest() {
    var rows=repository.latest();
    return rows.isEmpty()?Map.of("status","NOT_STARTED")
        :result(rows.get(0).id(),rows.get(0).type(),rows.get(0).status(),rows.get(0).count(),rows.get(0).details(),correlationId());
  }

}
