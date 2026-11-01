package local.bank.channel.risk;
import local.bank.channel.operations.RiskController;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RiskControllerMappingTest {
  private static final UUID DECISION_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TRANSFER_ID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final OffsetDateTime CREATED = OffsetDateTime.parse("2026-07-15T01:30:00Z");
  private static final OffsetDateTime UPDATED = OffsetDateTime.parse("2026-07-15T01:40:00Z");

  @Test
  void mapsReviewDecisionToActiveAlertAndUnderReviewCase() {
    var row = new RiskRepository.DecisionRow(DECISION_ID, TRANSFER_ID, "customer-a", "REVIEW",
        "Amount requires manual review", "maker-a", null, 1, CREATED, UPDATED);

    Map<String, Object> alert = RiskController.toAlert(row);
    Map<String, Object> riskCase = RiskController.toCase(row);

    assertEquals("ACTIVE", alert.get("status"));
    assertEquals("HIGH", alert.get("severity"));
    assertEquals(72, alert.get("score"));
    assertNull(alert.get("resolvedAt"));
    assertEquals("UNDER_REVIEW", riskCase.get("status"));
    assertEquals("REVIEW", riskCase.get("decision"));
    assertEquals(1, riskCase.get("version"));
  }

  @Test
  void mapsCheckedAllowDecisionToResolvedAndApproved() {
    var row = new RiskRepository.DecisionRow(DECISION_ID, TRANSFER_ID, "customer-a", "ALLOW",
        "Approved after review", "maker-a", "checker-b", 2, CREATED, UPDATED);

    Map<String, Object> alert = RiskController.toAlert(row);
    Map<String, Object> riskCase = RiskController.toCase(row);

    assertEquals("RESOLVED", alert.get("status"));
    assertEquals("checker-b", alert.get("acknowledgedBy"));
    assertEquals(UPDATED.toString(), alert.get("resolvedAt"));
    assertEquals("APPROVED", riskCase.get("status"));
    assertEquals("checker-b", riskCase.get("checker"));
    assertEquals(UPDATED.toString(), riskCase.get("reviewedAt"));
  }
}
