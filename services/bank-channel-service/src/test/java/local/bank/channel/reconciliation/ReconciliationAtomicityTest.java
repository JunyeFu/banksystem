package local.bank.channel.reconciliation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import com.fasterxml.jackson.databind.ObjectMapper;
import local.bank.channel.FineractTransferPort;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.TransactionDefinition;

class ReconciliationAtomicityTest {
  @Test void manualPersistenceRollsBackAndCoreReadRunsOutsideTransaction() {
    var active=new AtomicBoolean();var rollback=new AtomicBoolean();
    var tx=new AbstractPlatformTransactionManager() {
      protected Object doGetTransaction(){return new Object();}
      protected void doBegin(Object transaction,TransactionDefinition definition){active.set(true);}
      protected void doCommit(DefaultTransactionStatus status){active.set(false);}
      protected void doRollback(DefaultTransactionStatus status){rollback.set(true);active.set(false);}
    };
    var repository=mock(ReconciliationRepository.class);
    var core=mock(FineractTransferPort.class);
    when(repository.transferFacts()).thenReturn(List.of(new ReconciliationRepository.TransferFact(
        UUID.randomUUID(),"key",1,2,new java.math.BigDecimal("100.00"),"CNY",3L)));
    when(core.findAccountTransfer(anyString(),any(),anyLong(),anyLong(),any(),anyString())).thenAnswer(call->{
      assertFalse(active.get());return java.util.Optional.empty();
    });
    doAnswer(call->{assertTrue(active.get());throw new IllegalStateException("difference write failed");})
      .when(repository).difference(any(),any());
    var service=new ReconciliationService(repository,core,new ObjectMapper(),tx,mock(local.bank.channel.FineractOperationsPort.class),mock(local.bank.channel.FineractAccountPort.class));
    assertThrows(IllegalStateException.class,()->service.run("CHANNEL_TO_CORE"));
    assertTrue(rollback.get());assertFalse(active.get());
  }
}
