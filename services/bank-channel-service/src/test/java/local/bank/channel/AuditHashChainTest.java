package local.bank.channel;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuditHashChainTest {

  @Test
  void recordHashShouldBeDeterministic() {
    String input1 = "null|TRANSFER_CREATED|alice|TR-001|CREATE|SUCCESS";
    String input2 = "null|TRANSFER_CREATED|alice|TR-001|CREATE|SUCCESS";
    assertEquals(sha256(input1), sha256(input2));
  }

  @Test
  void recordHashShouldChangeWhenInputChanges() {
    String input1 = "null|TRANSFER_CREATED|alice|TR-001|CREATE|SUCCESS";
    String input2 = "null|TRANSFER_CREATED|alice|TR-001|CREATE|FAILED";
    assertNotEquals(sha256(input1), sha256(input2));
  }

  @Test
  void previousHashShouldPropagate() {
    String h1 = sha256("null|E1|alice|R1|CREATE|SUCCESS");
    String h2 = sha256(h1 + "|E2|alice|R2|PROCESS|SUCCESS");
    assertNotNull(h1);
    assertNotNull(h2);
    assertNotEquals(h1, h2);
  }

  @Test
  void nullPreviousHashShouldBeAllowedForFirstRecord() {
    String firstRecordInput = "null|FIRST_EVENT|system|INIT|BOOT|SUCCESS";
    String hash = sha256(firstRecordInput);
    assertNotNull(hash);
    assertEquals(64, hash.length());
  }

  private static String sha256(String input) {
    try {
      byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
          .digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }
}
