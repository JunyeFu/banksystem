package local.bank.channel.beneficiaries;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import org.junit.jupiter.api.Test;

class BeneficiaryTokenServiceTest {
  @Test
  void tokenIsDeterministicAndKeyed() {
    String first = new BeneficiaryTokenService("server-secret-one").token(" 621800005302 ");
    String repeated = new BeneficiaryTokenService("server-secret-one").token("621800005302");
    String otherKey = new BeneficiaryTokenService("server-secret-two").token("621800005302");
    assertEquals(first, repeated);
    assertNotEquals(first, otherKey);
    assertNotEquals("621800005302", first);
    assertEquals(64, first.length());
  }
}
