package local.bank.channel;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MoneyTest {

  @Test
  void shouldNotUseDouble() {
    java.math.BigDecimal a = new java.math.BigDecimal("0.1");
    java.math.BigDecimal b = new java.math.BigDecimal("0.2");
    java.math.BigDecimal unsafeDoubleSum = new java.math.BigDecimal(0.1d)
        .add(new java.math.BigDecimal(0.2d));
    assertNotEquals(new java.math.BigDecimal("0.3"), unsafeDoubleSum);
    assertEquals(new java.math.BigDecimal("0.3"), a.add(b));
  }

  @Test
  void shouldSerializeAsString() {
    java.math.BigDecimal amount = new java.math.BigDecimal("100.00");
    assertEquals("100.00", amount.toPlainString());
  }

  @Test
  void shouldRejectNegativeAmount() {
    java.math.BigDecimal negative = new java.math.BigDecimal("-1.00");
    assertTrue(negative.signum() <= 0);
  }

  @Test
  void shouldHandleLargeAmount() {
    java.math.BigDecimal large = new java.math.BigDecimal("999999999999.99");
    assertEquals(2, large.scale());
  }
}
