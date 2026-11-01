package local.bank.channel.beneficiaries;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class BeneficiaryTokenService {
  private final byte[] key;

  public BeneficiaryTokenService(@Value("${bank.beneficiary-token-secret}") String secret) {
    this.key = secret.getBytes(StandardCharsets.UTF_8);
  }

  public String token(String accountNumber) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(
          ("beneficiary-account:" + accountNumber.trim()).getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException exception) {
      throw new IllegalStateException("Beneficiary token generation failed", exception);
    }
  }
}
