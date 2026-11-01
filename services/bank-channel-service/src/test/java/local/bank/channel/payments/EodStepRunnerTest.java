package local.bank.channel.payments;
import local.bank.channel.operations.EodStepRunner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

class EodStepRunnerTest {
  @Test
  void completesEveryStepInOrder() {
    var completed = new LinkedHashSet<String>();
    var executed = new ArrayList<String>();

    EodStepRunner.run(List.of("HEALTH", "RECONCILE", "ADVANCE_DATE"), completed,
        executed::add, step -> { });

    assertEquals(List.of("HEALTH", "RECONCILE", "ADVANCE_DATE"), executed);
    assertEquals(executed, new ArrayList<>(completed));
  }

  @Test
  void resumesAfterInterruptionWithoutRepeatingCompletedSteps() {
    var completed = new LinkedHashSet<String>();
    var executed = new ArrayList<String>();

    assertThrows(IllegalStateException.class, () -> EodStepRunner.run(
        List.of("HEALTH", "CORE_JOB", "ADVANCE_DATE"), completed,
        step -> {
          executed.add(step);
          if ("CORE_JOB".equals(step)) throw new IllegalStateException("interrupted");
        }, step -> { }));

    EodStepRunner.run(List.of("HEALTH", "CORE_JOB", "ADVANCE_DATE"), completed,
        executed::add, step -> { });

    assertEquals(List.of("HEALTH", "CORE_JOB", "CORE_JOB", "ADVANCE_DATE"), executed);
    assertEquals(List.of("HEALTH", "CORE_JOB", "ADVANCE_DATE"), new ArrayList<>(completed));
  }
}
