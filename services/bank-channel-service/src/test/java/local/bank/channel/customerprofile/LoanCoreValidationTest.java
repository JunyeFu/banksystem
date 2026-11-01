package local.bank.channel.customerprofile;

import java.util.Map;
import java.util.UUID;
import local.bank.channel.FineractLoanPort;
import local.bank.channel.FineractOperationsPort;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LoanCoreValidationTest {
  @Test void rejectsInvalidMoneyAndBlankKeyBeforeCoreWrite() {
    var repository = mock(LoanRepository.class);
    var core = mock(FineractLoanPort.class);
    var operations = mock(FineractOperationsPort.class);
    var loanOperations=mock(LoanOperationService.class);
    var controller = new LoanCoreController(loanOperations, mock(LoanWorkflowService.class));
    var jwt = Jwt.withTokenValue("test").header("alg","none").subject("synthetic").build();
    var id = UUID.randomUUID();
    when(repository.coreLoanFor("synthetic", id)).thenReturn(1L);
    for (String amount : new String[]{"0", "-1.00", "0.001", "100000000000000000.00", "not-money"}) {
      var error = assertThrows(ResponseStatusException.class,
          () -> controller.repayment(jwt, id, "key", Map.of("transactionAmount", amount)));
      assertEquals(400, error.getStatusCode().value());
    }
    assertEquals(400, assertThrows(ResponseStatusException.class,
        () -> controller.repayment(jwt, id, " ", Map.of("transactionAmount","1.00"))).getStatusCode().value());
    verifyNoInteractions(core, operations,loanOperations);
  }
}
