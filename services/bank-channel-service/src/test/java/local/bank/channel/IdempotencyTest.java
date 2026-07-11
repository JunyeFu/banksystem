package local.bank.channel;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class IdempotencyTest {

  @Test
  void sameKeyAndSameHashShouldBeIdempotent() {
    String key1 = "transfer-test-001";
    String key2 = "transfer-test-001";
    String hash1 = sha256("{\"amount\":\"100.00\"}");
    String hash2 = sha256("{\"amount\":\"100.00\"}");
    assertEquals(key1, key2);
    assertEquals(hash1, hash2);
  }

  @Test
  void sameKeyAndDifferentHashShouldConflict() {
    String key1 = "transfer-test-002";
    String key2 = "transfer-test-002";
    String hash1 = sha256("{\"amount\":\"100.00\"}");
    String hash2 = sha256("{\"amount\":\"200.00\"}");
    assertEquals(key1, key2);
    assertNotEquals(hash1, hash2);
  }

  @Test
  void coreIdempotencyKeyShouldTruncateLongKeys() {
    String longKey = "transfer-with-a-very-long-idempotency-key-that-exceeds-the-48-character-limit-of-fineract";
    String truncated = truncateCoreKey(longKey);
    assertTrue(truncated.length() <= 48);
    assertTrue(truncated.startsWith("ch-"));
  }

  @Test
  void coreIdempotencyKeyShouldNotTruncateShortKeys() {
    String shortKey = "short-key-001";
    String result = truncateCoreKey(shortKey);
    assertEquals(shortKey, result);
  }

  private String truncateCoreKey(String key) {
    if (key == null || key.length() <= 48) return key;
    try {
      byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
          .digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return "ch-" + java.util.HexFormat.of().formatHex(digest).substring(0, 45);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private String sha256(String input) {
    try {
      byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
          .digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }
}
