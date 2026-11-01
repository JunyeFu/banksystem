package local.bank.channel;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FineractTransferPort {
  public record Submission(Long coreId) { }
  public record VerifiedTransfer(long coreId) { }

  private final RestClient client;
  private final FineractAccountPort accounts;
  private final FineractOperationsPort operations;
  public FineractTransferPort(FineractTransport transport, FineractAccountPort accounts, FineractOperationsPort operations) {
    this.client = transport.client(); this.accounts = accounts; this.operations = operations;
  }

  public Submission accountTransfer(long fromAccountId, long toAccountId, java.math.BigDecimal amount, String currency, String idempotencyKey) {
    FineractAccountPort.SavingsAccount from = accounts.accountDetails(fromAccountId);
    FineractAccountPort.SavingsAccount to = accounts.accountDetails(toAccountId);
    String description = transferDescription(idempotencyKey);
    AccountTransferRequest body = new AccountTransferRequest(fromAccountId, toAccountId, amount, operations.postingDate().toString(), 2, 2, 1, from.clientId(), 1, to.clientId(), description, "en", "yyyy-MM-dd", currency);
    String coreKey = FineractTransport.coreIdempotencyKey(idempotencyKey);
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> response = client.post().uri(uri -> uri.path("/api/v1/accounttransfers")
          .queryParam("fromOfficeId", 1).queryParam("fromClientId", from.clientId())
          .queryParam("toOfficeId", 1).queryParam("toClientId", to.clientId())
          .queryParam("transferDescription", description).build())
          .contentType(MediaType.APPLICATION_JSON)
          .header("Idempotency-Key", coreKey).header("X-Idempotency-Key", coreKey)
          .body(body).retrieve().body(Map.class);
      if (response == null) throw new CoreTransferOutcomeUnknownException("Core transfer response unavailable");
      return new Submission(coreReference(response));
    } catch (org.springframework.web.client.RestClientResponseException error) {
      int status = error.getStatusCode().value();
      if (status >= 400 && status < 500) {
        var problem=error.getResponseBodyAs(com.fasterxml.jackson.databind.JsonNode.class);
        var codes=new java.util.ArrayList<String>();
        if(problem!=null)for(var item:problem.path("errors")) {
          String code=item.path("userMessageGlobalisationCode").asText();
          if(code.matches("[A-Za-z0-9_.-]{1,160}"))codes.add(code);
        }
        throw new CoreTransferRejectedException(status, String.join(",",codes));
      }
      throw new CoreTransferOutcomeUnknownException("Fineract transfer returned " + status, error);
    } catch (org.springframework.web.client.ResourceAccessException error) {
      throw new CoreTransferOutcomeUnknownException("Core transfer response unavailable", error);
    }
  }

  /**
   * Reads the authoritative core result without submitting another debit. The channel key is
   * embedded in Fineract's transfer description because this Fineract build does not expose a
   * contracted idempotency lookup endpoint.
   */
  @SuppressWarnings("unchecked")
  public Optional<VerifiedTransfer> findAccountTransfer(String idempotencyKey, Long expectedTransferId,
                                                            long fromAccountId, long toAccountId,
                                                            java.math.BigDecimal amount) {
    return findAccountTransfer(idempotencyKey, expectedTransferId, fromAccountId, toAccountId, amount, null);
  }

  @SuppressWarnings("unchecked")
  public Optional<VerifiedTransfer> findAccountTransfer(String idempotencyKey, Long expectedTransferId,
                                                            long fromAccountId, long toAccountId,
                                                            java.math.BigDecimal amount, String currency) {
    if (expectedTransferId != null) {
      Map<String, Object> transfer = client.get().uri("/api/v1/accounttransfers/{id}", expectedTransferId)
          .retrieve().body(Map.class);
      if (matchesAccountTransfer(transfer, idempotencyKey, fromAccountId, toAccountId, amount, currency)) {
        return Optional.of(verified(transfer));
      }
      throw new IllegalStateException("Core transfer does not match the submitted operation");
    }

    List<Map<String, Object>> matches = new java.util.ArrayList<>();
    int offset = 0;
    int total;
    do {
      int pageOffset = offset;
      Map<String, Object> page = client.get().uri(uri -> uri.path("/api/v1/accounttransfers")
              .queryParam("accountDetailId", fromAccountId)
              .queryParam("orderBy", "id")
              .queryParam("sortOrder", "DESC")
              .queryParam("limit", 100)
              .queryParam("offset", pageOffset)
              .build())
          .retrieve().body(Map.class);
      Object rawItems = page == null ? null : page.get("pageItems");
      if (!(rawItems instanceof List<?> items) || items.isEmpty()) break;
      items.stream()
          .filter(Map.class::isInstance)
          .map(item -> (Map<String, Object>) item)
          .filter(item -> transferDescription(idempotencyKey).equals(String.valueOf(item.get("transferDescription"))))
          .forEach(matches::add);
      offset += items.size();
      Object rawTotal = page.get("totalFilteredRecords");
      total = rawTotal instanceof Number number ? number.intValue() : offset;
    } while (offset < total);
    if (matches.size() > 1) throw new IllegalStateException("Core transfer key is not unique");
    if (matches.isEmpty()) return Optional.empty();
    Map<String, Object> transfer = matches.get(0);
    if (!matchesAccountTransfer(transfer, idempotencyKey, fromAccountId, toAccountId, amount, currency)) {
      throw new IllegalStateException("Core transfer key matched different transfer data");
    }
    return Optional.of(verified(transfer));
  }

  private static VerifiedTransfer verified(Map<String, Object> transfer) {
    Long id = coreReference(transfer);
    if (id == null) throw new CoreTransferOutcomeUnknownException("Core readback did not include a transfer id");
    return new VerifiedTransfer(id);
  }

  private static Long coreReference(Map<String, Object> response) {
    Object value = response.getOrDefault("resourceId", response.get("id"));
    if (value instanceof Number number) return number.longValue();
    if (value == null || String.valueOf(value).isBlank()) return null;
    try { return Long.parseLong(String.valueOf(value)); }
    catch (NumberFormatException ignored) { return null; }
  }

  static boolean matchesAccountTransfer(Map<String, Object> transfer, String idempotencyKey,
                                        long fromAccountId, long toAccountId,
                                        java.math.BigDecimal amount) {
    return matchesAccountTransfer(transfer, idempotencyKey, fromAccountId, toAccountId, amount, null);
  }

  static boolean matchesAccountTransfer(Map<String, Object> transfer, String idempotencyKey,
                                        long fromAccountId, long toAccountId,
                                        java.math.BigDecimal amount, String currency) {
    if (transfer == null || Boolean.TRUE.equals(transfer.get("reversed"))) return false;
    return transferDescription(idempotencyKey).equals(String.valueOf(transfer.get("transferDescription")))
        && nestedId(transfer.get("fromAccount")) == fromAccountId
        && nestedId(transfer.get("toAccount")) == toAccountId
        && new java.math.BigDecimal(String.valueOf(transfer.get("transferAmount"))).compareTo(amount) == 0
        && (currency == null || currency.equals(currencyCode(transfer.get("currency"))));
  }

  private static String currencyCode(Object value) {
    return value instanceof Map<?, ?> map ? String.valueOf(map.get("code")) : String.valueOf(value);
  }

  private static long nestedId(Object value) {
    if (value instanceof Map<?, ?> map && map.get("id") instanceof Number id) return id.longValue();
    return Long.MIN_VALUE;
  }

  static String transferDescription(String idempotencyKey) {
    return "HENGZHUN:" + FineractTransport.coreIdempotencyKey(idempotencyKey);
  }


  private record AccountTransferRequest(long fromAccountId, long toAccountId, java.math.BigDecimal transferAmount, String transferDate, int fromAccountType, int toAccountType, int fromOfficeId, long fromClientId, int toOfficeId, long toClientId, String transferDescription, String locale, String dateFormat, String currencyCode) {}


  public static final class CoreTransferRejectedException extends RuntimeException {
    private final int status;

    public CoreTransferRejectedException(int status, String response) {
      super("Fineract transfer rejected with HTTP " + status + (response.isEmpty()?"":": "+response));
      this.status = status;
    }

    public int status() { return status; }
  }

  public static final class CoreTransferOutcomeUnknownException extends RuntimeException {
    public CoreTransferOutcomeUnknownException(String message) { super(message); }
    public CoreTransferOutcomeUnknownException(String message, Throwable cause) { super(message, cause); }
  }

}
