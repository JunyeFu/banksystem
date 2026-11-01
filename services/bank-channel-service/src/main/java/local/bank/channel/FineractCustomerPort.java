package local.bank.channel;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FineractCustomerPort {
  public record ClientRef(long id) { }

  private final RestClient client;
  public FineractCustomerPort(FineractTransport transport) { this.client = transport.client(); }

  public ClientRef createClient(String displayName, String mobileNo, String externalId) {
    String[] parts = displayName.split(" ", 2);
    String firstname = parts.length >= 2 ? parts[0] : "Test";
    String lastname = parts.length >= 2 ? parts[1] : displayName;
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("officeId", 1);
    body.put("firstname", firstname);
    body.put("lastname", lastname);
    body.put("externalId", externalId);
    body.put("active", true);
    body.put("activationDate", LocalDate.of(2020, 1, 1).toString());
    body.put("dateFormat", "yyyy-MM-dd");
    body.put("locale", "en");
    if (mobileNo != null && !mobileNo.isBlank()) body.put("mobileNo", mobileNo);
    body.put("legalFormId", 1);
    return clientRef(client.post().uri("/api/v1/clients").body(body).retrieve().body(Map.class));
  }

  public ClientRef clientByExternalId(String externalId) {
    try {
      return clientRef(client.get().uri("/api/v1/clients/external-id/{externalId}", externalId).retrieve().body(Map.class));
    } catch (org.springframework.web.client.RestClientResponseException error) {
      if (error.getStatusCode().value() == 404) return null;
      throw error;
    }
  }

  private static ClientRef clientRef(Map<?, ?> response) {
    if (response != null) {
      for (String field : new String[] {"id", "clientId", "resourceId"}) {
        if (response.get(field) instanceof Number id) return new ClientRef(id.longValue());
      }
    }
    throw new IllegalStateException("Fineract client id missing");
  }

}
