package local.bank.channel.identity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import local.bank.channel.CoreReadModelException;
import local.bank.channel.FineractAccountPort;

public final class CustomerTransactionMapper {
  private CustomerTransactionMapper() {}

  public static Map<String, Object> map(FineractAccountPort.SavingsTransaction source) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("transactionId", source.id());
    result.put("transactionDate", source.date().contains("T") ? source.date() : source.date() + "T00:00:00Z");
    result.put("transactionType", source.type());
    result.put("description", source.description());
    if (source.counterparty() != null) result.put("counterparty", source.counterparty());
    if (source.amount() == null) throw new CoreReadModelException("Core transaction amount is missing");
    result.put("amount", source.amount().toPlainString());
    if (source.currency() == null) throw new CoreReadModelException("Core transaction currency is missing");
    result.put("currency", source.currency());
    if (source.runningBalance() != null) result.put("runningBalance", source.runningBalance().toPlainString());
    return result;
  }

  public static BigDecimal money(Object value, String field) {
    if (value == null || String.valueOf(value).isBlank())
      throw new CoreReadModelException("Core " + field + " is missing");
    try {
      return new BigDecimal(String.valueOf(value)).setScale(2, RoundingMode.HALF_UP);
    } catch (NumberFormatException exception) {
      throw new CoreReadModelException("Core " + field + " is invalid");
    }
  }

  public static String moneyText(Object value, String field) {
    return money(value, field).toPlainString();
  }

}
