package local.bank.channel.operations;

import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

public final class EodStepRunner {
  private EodStepRunner() {}

  public static void run(List<String> orderedSteps, Set<String> completed,
                  Consumer<String> action, Consumer<String> checkpoint) {
    for (String step : orderedSteps) {
      if (completed.contains(step)) continue;
      action.accept(step);
      checkpoint.accept(step);
      completed.add(step);
    }
  }
}
