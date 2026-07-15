package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FineractAdapterTest {
  @Test
  void resolvesTheSingleExactSavingsAccount() {
    long id = FineractAdapter.selectSavingsAccountId(List.of(
        Map.of("entityId", 42L, "entityAccountNo", "000123"),
        Map.of("entityId", 43L, "entityAccountNo", "000124")), "000123");
    assertEquals(42L, id);
  }

  @Test
  void rejectsMissingSavingsAccount() {
    assertThrows(IllegalArgumentException.class,
        () -> FineractAdapter.selectSavingsAccountId(List.of(), "000123"));
  }

  @Test
  void rejectsAmbiguousSavingsAccount() {
    var matches = List.of(
        Map.<String, Object>of("entityId", 42L, "entityAccountNo", "000123"),
        Map.<String, Object>of("entityId", 43L, "entityAccountNo", "000123"));
    assertThrows(IllegalArgumentException.class,
        () -> FineractAdapter.selectSavingsAccountId(matches, "000123"));
  }
}
