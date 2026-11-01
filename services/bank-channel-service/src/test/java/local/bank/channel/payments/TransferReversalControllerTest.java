package local.bank.channel.payments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import local.bank.channel.FineractTransferPort;
import local.bank.channel.audit.AuditService;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.web.server.ResponseStatusException;

class TransferReversalControllerTest {
  private JdbcTemplate jdbc;
  private FineractTransferPort fineract;
  private TransferReversalController controller;
  private final ArrayDeque<ReversalRow> rows=new ArrayDeque<>();

  @BeforeEach
  void setUp() throws Exception {
    jdbc=mock(JdbcTemplate.class);fineract=mock(FineractTransferPort.class);
    when(jdbc.query(startsWith("SELECT r.transfer_id"),org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),any(UUID.class)))
        .thenAnswer(invocation->{ReversalRow row=rows.removeFirst();ResultSet rs=mock(ResultSet.class);when(rs.getObject(1,UUID.class)).thenReturn(row.transferId());when(rs.getString(2)).thenReturn(row.maker());when(rs.getString(3)).thenReturn(row.checker());when(rs.getString(4)).thenReturn(row.status());when(rs.getInt(5)).thenReturn(1);when(rs.getString(6)).thenReturn(null);when(rs.getObject(7)).thenReturn(row.submitted()?new Object():null);when(rs.getString(8)).thenReturn(row.submitted()?"reverse-key":null);when(rs.getLong(9)).thenReturn(101L);when(rs.getLong(10)).thenReturn(202L);when(rs.getBigDecimal(11)).thenReturn(new BigDecimal("10.00"));when(rs.getString(12)).thenReturn("CNY");RowMapper<?> mapper=invocation.getArgument(1);return List.of(mapper.mapRow(rs,0));});
    controller=new TransferReversalController(new TransferReversalRepository(jdbc),fineract,mock(AuditService.class),mock(TransferStateMachine.class),new DirectTransactions());
  }

  @Test
  void unknownReversalReentryReadsBackWithoutSecondPost() {
    UUID reversalId=UUID.randomUUID();UUID transferId=UUID.randomUUID();
    rows.add(new ReversalRow(transferId,"maker","checker","PENDING",false));
    rows.add(new ReversalRow(transferId,"maker","checker","CORE_RESULT_UNKNOWN",true));
    when(fineract.accountTransfer(202L,101L,new BigDecimal("10.00"),"CNY","reverse-key"))
        .thenThrow(new RuntimeException("response lost"));
    when(fineract.findAccountTransfer("reverse-key",null,202L,101L,new BigDecimal("10.00")))
        .thenReturn(Optional.empty());

    assertEquals("CORE_RESULT_UNKNOWN",controller.approve(jwt("checker"),reversalId,1,new TransferReversalController.Reason("approved"),"reverse-key").get("status"));
    assertEquals("CORE_RESULT_UNKNOWN",controller.approve(jwt("checker"),reversalId,1,new TransferReversalController.Reason("approved"),"reverse-key").get("status"));

    verify(fineract,times(1)).accountTransfer(202L,101L,new BigDecimal("10.00"),"CNY","reverse-key");
    verify(fineract,times(2)).findAccountTransfer("reverse-key",null,202L,101L,new BigDecimal("10.00"));
  }

  @Test
  void makerCannotApproveOwnReversal() {
    UUID reversalId=UUID.randomUUID();rows.add(new ReversalRow(UUID.randomUUID(),"maker",null,"PENDING",false));
    assertThrows(ResponseStatusException.class,()->controller.approve(jwt("maker"),reversalId,1,new TransferReversalController.Reason("self"),"reverse-key"));
    verify(fineract,never()).accountTransfer(any(Long.class),any(Long.class),any(BigDecimal.class),anyString(),anyString());
  }

  @Test
  void secondCheckerCannotTakeOverUnknownReversal() {
    UUID reversalId=UUID.randomUUID();rows.add(new ReversalRow(UUID.randomUUID(),"maker","checker-a","CORE_RESULT_UNKNOWN",true));
    assertThrows(ResponseStatusException.class,()->controller.approve(jwt("checker-b"),reversalId,1,new TransferReversalController.Reason("takeover"),"reverse-key"));
    verify(fineract,never()).findAccountTransfer(anyString(),any(),any(Long.class),any(Long.class),any(BigDecimal.class));
  }

  private static Jwt jwt(String subject){return Jwt.withTokenValue("test").header("alg","none").subject(subject).build();}
  private record ReversalRow(UUID transferId,String maker,String checker,String status,boolean submitted){}
  private static final class DirectTransactions implements TransactionOperations {public <T>T execute(TransactionCallback<T> action){return action.doInTransaction(mock(TransactionStatus.class));}}
}
