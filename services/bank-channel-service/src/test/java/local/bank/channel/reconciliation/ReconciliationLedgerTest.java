package local.bank.channel.reconciliation;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import local.bank.channel.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ReconciliationLedgerTest {
  @Test void checksBothCoreLegsAndDoesNotAcceptUnrelatedBalancedEntries() {
    var repository=mock(ReconciliationRepository.class);
    var transfers=mock(FineractTransferPort.class);
    var operations=mock(FineractOperationsPort.class);
    var accounts=mock(FineractAccountPort.class);
    var tx=mock(PlatformTransactionManager.class);
    when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    var id=UUID.randomUUID();
    when(repository.transferFacts()).thenReturn(List.of(new ReconciliationRepository.TransferFact(id,"key",3,4,BigDecimal.TEN,"CNY",70L)));
    when(transfers.findAccountTransfer("key",70L,3,4,BigDecimal.TEN,"CNY")).thenReturn(Optional.of(new FineractTransferPort.VerifiedTransfer(70)));
    when(accounts.ledgerView(3)).thenReturn(new FineractAccountPort.SavingsLedgerView(2,2L,List.of(new FineractAccountPort.TransferLeg(101,70,BigDecimal.TEN,"CNY","DEBIT"))));
    when(accounts.ledgerView(4)).thenReturn(new FineractAccountPort.SavingsLedgerView(2,2L,List.of(new FineractAccountPort.TransferLeg(102,70,BigDecimal.TEN,"CNY","CREDIT"))));
    var entries=List.of(entry(101,2,"DEBIT"),entry(101,6,"CREDIT"),entry(102,6,"DEBIT"),entry(102,2,"CREDIT"));
    when(operations.journalEntries()).thenReturn(entries);
    var service=new ReconciliationService(repository,transfers,new ObjectMapper(),tx,operations,accounts);
    assertEquals("MATCHED",service.run("CORE_TO_GENERAL_LEDGER").get("status"));
    when(operations.journalEntries()).thenReturn(List.of(entry(999,2,"DEBIT"),entry(999,6,"CREDIT")));
    assertEquals("DIFFERENCE",service.run("CORE_TO_GENERAL_LEDGER").get("status"));
    when(accounts.ledgerView(3)).thenReturn(new FineractAccountPort.SavingsLedgerView(1,null,List.of()));
    when(accounts.ledgerView(4)).thenReturn(new FineractAccountPort.SavingsLedgerView(1,null,List.of()));
    var legacy=service.run("CORE_TO_GENERAL_LEDGER");
    assertEquals("DIFFERENCE",legacy.get("status"));
    assertTrue(legacy.get("details").toString().contains("\"excludedLegacyTransfers\":1"));
  }
  private static FineractOperationsPort.JournalEntry entry(long transaction,long account,String direction) {
    return new FineractOperationsPort.JournalEntry("S"+transaction,BigDecimal.TEN,direction,transaction,"CNY",account,2,transaction==102?4L:3L,false);
  }
}
