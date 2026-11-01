package local.bank.channel.operations;

import java.util.Map;
import java.util.UUID;
import local.bank.channel.risk.RiskService;
import local.bank.channel.payments.statemachine.TransferStateMachine;
import local.bank.channel.payments.statemachine.TransferStateMachine.Status;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RiskApprovalService {
  private final RiskService risk;
  private final TransferStateMachine transfers;
  public RiskApprovalService(RiskService risk,TransferStateMachine transfers){this.risk=risk;this.transfers=transfers;}
  @Transactional
  public Map<String,Object> approve(UUID decisionId,String checker,int version,String reason) {
    var result=risk.approve(decisionId,checker,version,reason);
    transfers.transitionState(result.transferId(),Status.RISK_REVIEW,Status.PENDING_CORE_POSTING,
        "USER",checker,"RISK_APPROVED",Map.of("decisionId",decisionId.toString()));
    return Map.of("decisionId",decisionId.toString(),"transferId",result.transferId().toString(),
        "decision","ALLOW","version",result.version());
  }
}
