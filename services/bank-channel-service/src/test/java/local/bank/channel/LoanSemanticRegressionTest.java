package local.bank.channel;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class LoanSemanticRegressionTest {
  @Test void annualRateAndAll480InstallmentsSurviveMapping() {
    var periods=IntStream.rangeClosed(1,480).mapToObj(i -> Map.of("period",i,
        "dueDate",java.time.LocalDate.of(2026,1,1).plusMonths(i).toString())).toList();
    var loan=FineractLoanPort.loan(Map.of("id",1,"annualInterestRate","4.35",
        "interestRatePerPeriod","0.3625", "repaymentSchedule",Map.of("periods",periods)));
    assertEquals("4.35",loan.interestRate());
    assertEquals(480,loan.schedule().size());
    assertEquals(480,loan.schedule().getLast().period());
  }
  @Test void monthlyRateRequiresItsFrequencyAndConvertsToAnnual() {
    assertEquals("4.35",FineractLoanPort.loan(Map.of("id",1,"interestRatePerPeriod","0.3625",
        "interestRateFrequencyType",Map.of("id",2))).interestRate());
    assertThrows(CoreReadModelException.class,()->FineractLoanPort.loan(Map.of("id",1,"interestRatePerPeriod","0.3625")));
  }
}
