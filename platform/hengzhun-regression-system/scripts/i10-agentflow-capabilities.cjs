'use strict'

// v5 is a reproducible fallback input.  Every executable capability assertion
// must inspect the publishable v6 graph instead of treating the fallback as
// the running product.
const generationAuthority = 'scripts/build-i10-agentflow-v6.cjs'
const schemaVersion = 'hengzhun-i10-agentflow-capabilities-v1'

const activeCapabilities = [
  {
    id: 'ENTRY_SECRET_GUARD',
    requiredNodes: [
      'customFunctionAgentflow_i10_v4_entry_secret_guard',
      'conditionAgentflow_i10_v4_entry_safe',
      'directReplyAgentflow_i10_v4_entry_blocked'
    ],
    requiredPaths: [
      ['startAgentflow_i10_v3', 'customFunctionAgentflow_i10_v4_entry_secret_guard'],
      ['customFunctionAgentflow_i10_v4_entry_secret_guard', 'llmAgentflow_i10_v3_classify'],
      ['customFunctionAgentflow_i10_v4_entry_secret_guard', 'directReplyAgentflow_i10_v4_entry_blocked']
    ]
  },
  {
    id: 'ENTRY_CLASSIFICATION',
    requiredNodes: ['startAgentflow_i10_v3', 'llmAgentflow_i10_v3_classify', 'toolAgentflow_i10_v3_prepare'],
    requiredPaths: [
      ['startAgentflow_i10_v3', 'llmAgentflow_i10_v3_classify'],
      ['llmAgentflow_i10_v3_classify', 'toolAgentflow_i10_v3_prepare']
    ]
  },
  {
    id: 'LOCAL_CREDENTIAL_CAPTURE',
    requiredNodes: [
      'toolAgentflow_i10_v3_credential_create',
      'directReplyAgentflow_i10_v3_credential',
      'toolAgentflow_i10_v3_credential_refresh'
    ],
    requiredPaths: [
      ['startAgentflow_i10_v3', 'toolAgentflow_i10_v3_credential_create'],
      ['toolAgentflow_i10_v3_credential_create', 'directReplyAgentflow_i10_v3_credential']
    ]
  },
  {
    id: 'CASE_FILE_AND_VIDEO_INGEST',
    requiredNodes: [
      'toolAgentflow_i10_v3_ingest_file',
      'toolAgentflow_i10_v3_ingest_video',
      'toolAgentflow_i10_v3_ingest_get',
      'humanInputAgentflow_i10_v3_ingest_confirm',
      'toolAgentflow_i10_v3_ingest_decide'
    ],
    requiredPaths: [
      ['toolAgentflow_i10_v3_ingest_file', 'toolAgentflow_i10_v3_ingest_get'],
      ['toolAgentflow_i10_v3_ingest_video', 'toolAgentflow_i10_v3_ingest_get'],
      ['toolAgentflow_i10_v3_ingest_get', 'humanInputAgentflow_i10_v3_ingest_confirm'],
      ['humanInputAgentflow_i10_v3_ingest_confirm', 'toolAgentflow_i10_v3_ingest_decide']
    ]
  },
  {
    id: 'EXACT_PROPOSAL_JOURNEY',
    requiredNodes: [
      'toolAgentflow_i10_v3_prepare',
      'toolAgentflow_i10_v3_resume',
      'humanInputAgentflow_i10_v3_decision',
      'toolAgentflow_i10_v3_approve',
      'toolAgentflow_i10_v3_reject',
      'toolAgentflow_i10_v4_case_correction_submit'
    ],
    requiredPaths: [
      ['toolAgentflow_i10_v3_prepare', 'humanInputAgentflow_i10_v3_decision'],
      ['humanInputAgentflow_i10_v3_decision', 'toolAgentflow_i10_v3_approve'],
      ['humanInputAgentflow_i10_v3_decision', 'toolAgentflow_i10_v3_reject']
    ]
  },
  {
    id: 'INITIAL_CASE_INPUT',
    requiredNodes: [
      'humanInputAgentflow_i10_v4_initial_case_input',
      'customFunctionAgentflow_i10_v4_initial_case_guard',
      'customFunctionAgentflow_i10_v5_initial_prompt',
      'customFunctionAgentflow_i10_v3_normalize',
      'toolAgentflow_i10_v4_initial_case_submit'
    ],
    requiredPaths: [
      ['conditionAgentflow_i10_v3_needs_input', 'humanInputAgentflow_i10_v4_initial_case_input'],
      ['humanInputAgentflow_i10_v4_initial_case_input', 'toolAgentflow_i10_v4_initial_case_submit'],
      ['toolAgentflow_i10_v4_initial_case_submit', 'conditionAgentflow_i10_v3_needs_input']
    ]
  },
  {
    id: 'SUPPORTING_IMAGE_INGEST',
    requiredNodes: [
      'customFunctionAgentflow_i10_v4_image_route',
      'toolAgentflow_i10_v4_image_submit',
      'toolAgentflow_i10_v4_image_get',
      'conditionAgentflow_i10_v4_image_status',
      'directReplyAgentflow_i10_v4_image_pending'
    ],
    requiredPaths: [
      ['llmAgentflow_i10_v3_classify', 'toolAgentflow_i10_v4_image_submit'],
      ['toolAgentflow_i10_v4_image_submit', 'toolAgentflow_i10_v4_image_get'],
      ['toolAgentflow_i10_v4_image_get', 'conditionAgentflow_i10_v4_image_status']
    ]
  },
  {
    id: 'IMAGE_FACT_DECISION',
    requiredNodes: [
      'directReplyAgentflow_i10_v6_image_facts_transition',
      'conditionAgentflow_i10_v6_image_facts_resume_decision_route',
      'customFunctionAgentflow_i10_v4_image_suggested_decisions',
      'humanInputAgentflow_i10_v4_image_correction_input',
      'llmAgentflow_i10_v4_image_correction_structure',
      'humanInputAgentflow_i10_v4_image_correction_confirm',
      'toolAgentflow_i10_v4_image_decision_submit',
      'customFunctionAgentflow_i10_v6_confirmed_image_prompt',
      'toolAgentflow_i10_v6_confirmed_image_journey_prepare',
      'directReplyAgentflow_i10_v6_confirmed_image_journey_ready'
    ],
    requiredPaths: [
      ['conditionAgentflow_i10_v4_image_status', 'directReplyAgentflow_i10_v6_image_facts_transition'],
      ['conditionAgentflow_i10_v4_candidate_resume_route', 'conditionAgentflow_i10_v6_image_facts_resume_decision_route'],
      ['conditionAgentflow_i10_v6_image_facts_resume_decision_route', 'toolAgentflow_i10_v4_image_decision_submit'],
      ['conditionAgentflow_i10_v6_image_facts_resume_decision_route', 'humanInputAgentflow_i10_v4_image_correction_input'],
      ['toolAgentflow_i10_v4_image_decision_submit', 'directReplyAgentflow_i10_v6_image_confirmed_transition'],
      ['conditionAgentflow_i10_v4_candidate_resume_route', 'customFunctionAgentflow_i10_v6_confirmed_image_prompt'],
      ['customFunctionAgentflow_i10_v6_confirmed_image_prompt', 'toolAgentflow_i10_v6_confirmed_image_journey_prepare'],
      ['toolAgentflow_i10_v6_confirmed_image_journey_prepare', 'directReplyAgentflow_i10_v6_confirmed_image_journey_ready']
    ]
  },
  {
    id: 'BATCH_ITEM_DECISION',
    requiredNodes: [
      'customFunctionAgentflow_i10_v4_ingest_batch_inspect',
      'humanInputAgentflow_i10_v4_ingest_batch_input',
      'llmAgentflow_i10_v4_ingest_batch_structure',
      'humanInputAgentflow_i10_v4_ingest_batch_confirm',
      'toolAgentflow_i10_v4_ingest_batch_submit',
      'directReplyAgentflow_i10_v4_ingest_batch_done'
    ],
    requiredPaths: [
      ['toolAgentflow_i10_v3_ingest_get','humanInputAgentflow_i10_v4_ingest_batch_input'],
      ['humanInputAgentflow_i10_v4_ingest_batch_input','humanInputAgentflow_i10_v4_ingest_batch_confirm'],
      ['humanInputAgentflow_i10_v4_ingest_batch_confirm','toolAgentflow_i10_v4_ingest_batch_submit'],
      ['toolAgentflow_i10_v4_ingest_batch_submit','directReplyAgentflow_i10_v4_ingest_batch_done']
    ]
  },
  {
    id: 'RUNTIME_VERIFICATION',
    requiredNodes: [
      'conditionAgentflow_i10_v4_verification_route',
      'toolAgentflow_i10_v4_verification_get',
      'humanInputAgentflow_i10_v4_verification_ready',
      'toolAgentflow_i10_v4_verification_ready_submit',
      'humanInputAgentflow_i10_v4_verification_action',
      'toolAgentflow_i10_v4_verification_complete',
      'toolAgentflow_i10_v4_verification_cancel',
      'conditionAgentflow_i10_v4_formal_verification_route',
      'toolAgentflow_i10_v4_formal_verification_get',
      'humanInputAgentflow_i10_v4_formal_verification_ready',
      'toolAgentflow_i10_v4_formal_verification_ready_submit',
      'humanInputAgentflow_i10_v4_formal_verification_action',
      'toolAgentflow_i10_v4_formal_verification_complete',
      'toolAgentflow_i10_v4_formal_verification_cancel'
    ],
    requiredPaths: [
      ['toolAgentflow_candidate_ready','humanInputAgentflow_i10_v4_verification_ready'],
      ['humanInputAgentflow_i10_v4_verification_ready','humanInputAgentflow_i10_v4_verification_action'],
      ['humanInputAgentflow_i10_v4_verification_action','toolAgentflow_i10_v4_verification_complete'],
      ['toolAgentflow_i10_v4_verification_complete','toolAgentflow_candidate_ready'],
      ['toolAgentflow_task','humanInputAgentflow_i10_v4_formal_verification_ready'],
      ['humanInputAgentflow_i10_v4_formal_verification_ready','humanInputAgentflow_i10_v4_formal_verification_action'],
      ['humanInputAgentflow_i10_v4_formal_verification_action','toolAgentflow_i10_v4_formal_verification_complete'],
      ['toolAgentflow_i10_v4_formal_verification_complete','toolAgentflow_task']
    ]
  },
  {
    id: 'ASYNC_CANDIDATE_RESUME',
    requiredNodes: [
      'customFunctionAgentflow_i10_v4_candidate_resume_detect',
      'conditionAgentflow_i10_v4_candidate_resume_route',
      'toolAgentflow_candidate_ready',
      'directReplyAgentflow_i10_v4_candidate_processing'
    ],
    requiredPaths: [
      ['startAgentflow_i10_v3','conditionAgentflow_i10_v4_candidate_resume_route'],
      ['conditionAgentflow_i10_v4_candidate_resume_route','toolAgentflow_candidate_ready'],
      ['toolAgentflow_candidate_ready','directReplyAgentflow_i10_v4_candidate_processing']
    ]
  },
  {
    id: 'AUTHORING_FAILED_RETRY',
    requiredNodes: [
      'conditionAgentflow_candidate_authoring_failed',
      'humanInputAgentflow_i10_v4_authoring_retry',
      'toolAgentflow_i10_v4_authoring_retry',
      'conditionAgentflow_i10_v4_verification_route',
      'directReplyAgentflow_i10_v4_authoring_retry_declined'
    ],
    requiredPaths: [
      ['conditionAgentflow_candidate_authoring_failed','humanInputAgentflow_i10_v4_authoring_retry'],
      ['humanInputAgentflow_i10_v4_authoring_retry','toolAgentflow_i10_v4_authoring_retry'],
      ['toolAgentflow_i10_v4_authoring_retry','conditionAgentflow_i10_v4_verification_route'],
      ['humanInputAgentflow_i10_v4_authoring_retry','directReplyAgentflow_i10_v4_authoring_retry_declined']
    ]
  },
  {
    id: 'CROSS_SESSION_RESUME',
    requiredNodes: [
      'customFunctionAgentflow_i10_v4_candidate_resume_detect',
      'toolAgentflow_i10_v4_cross_session_journey_get',
      'customFunctionAgentflow_i10_v6_cross_session_candidate_state',
      'conditionAgentflow_i10_v4_cross_session_route',
      'toolAgentflow_candidate_ready',
      'customFunctionAgentflow_i10_v6_cross_session_decision_parse',
      'conditionAgentflow_i10_v6_cross_session_decision_route',
      'directReplyAgentflow_i10_v6_cross_session_decision_prompt'
    ],
    requiredPaths: [
      ['customFunctionAgentflow_i10_v4_candidate_resume_detect','toolAgentflow_i10_v4_cross_session_journey_get'],
      ['toolAgentflow_i10_v4_cross_session_journey_get','customFunctionAgentflow_i10_v6_cross_session_candidate_state'],
      ['customFunctionAgentflow_i10_v6_cross_session_candidate_state','conditionAgentflow_i10_v4_cross_session_route'],
      ['conditionAgentflow_i10_v4_cross_session_route','toolAgentflow_candidate_ready'],
      ['conditionAgentflow_i10_v4_cross_session_route','customFunctionAgentflow_i10_v6_cross_session_decision_parse'],
      ['customFunctionAgentflow_i10_v6_cross_session_decision_parse','conditionAgentflow_i10_v6_cross_session_decision_route'],
      ['conditionAgentflow_i10_v6_cross_session_decision_route','directReplyAgentflow_i10_v6_cross_session_decision_prompt']
    ]
  },
  {
    id: 'EXECUTION_PLAN_REVISE',
    requiredNodes: [
      'humanInputAgentflow_run',
      'humanInputAgentflow_i10_v4_confirm_on_demand',
      'humanInputAgentflow_i10_v4_confirm_one_time',
      'humanInputAgentflow_i10_v4_confirm_recurring',
      'humanInputAgentflow_repair_schedule'
    ],
    requiredPaths: [
      ['humanInputAgentflow_run','humanInputAgentflow_i10_v4_confirm_on_demand'],
      ['humanInputAgentflow_i10_v4_confirm_on_demand','humanInputAgentflow_run'],
      ['humanInputAgentflow_i10_v4_confirm_one_time','humanInputAgentflow_run'],
      ['humanInputAgentflow_i10_v4_confirm_recurring','humanInputAgentflow_run']
    ]
  },
  {
    id: 'MIDSCENE_TO_PLAYWRIGHT_CANDIDATE',
    requiredNodes: [
      'toolAgentflow_candidate',
      'toolAgentflow_candidate_ready',
      'conditionAgentflow_candidate_ready',
      'toolAgentflow_preview',
      'humanInputAgentflow_activate'
    ],
    requiredPaths: [
      ['toolAgentflow_candidate', 'toolAgentflow_candidate_ready'],
      ['toolAgentflow_candidate_ready', 'conditionAgentflow_candidate_ready'],
      ['conditionAgentflow_candidate_ready', 'toolAgentflow_preview'],
      ['toolAgentflow_preview', 'humanInputAgentflow_activate']
    ]
  },
  {
    id: 'RUN_SCHEDULE_RESULT',
    requiredNodes: [
      'humanInputAgentflow_run',
      'llmAgentflow_schedule_intent',
      'toolAgentflow_run',
      'toolAgentflow_schedule',
      'toolAgentflow_schedule_recurring',
      'toolAgentflow_result_inbox'
    ],
    requiredPaths: [
      ['humanInputAgentflow_run', 'llmAgentflow_schedule_intent'],
      ['llmAgentflow_schedule_intent', 'toolAgentflow_run'],
      ['llmAgentflow_schedule_intent', 'toolAgentflow_schedule'],
      ['llmAgentflow_schedule_intent', 'toolAgentflow_schedule_recurring']
    ]
  },
  {
    id: 'CONTROLLED_REPAIR',
    requiredNodes: [
      'toolAgentflow_failure',
      'humanInputAgentflow_repair_confirm',
      'toolAgentflow_repair_propose',
      'toolAgentflow_repair_ready',
      'humanInputAgentflow_repair_activate',
      'toolAgentflow_repair_decision',
      'toolAgentflow_repair_rerun'
    ],
    requiredPaths: [
      ['toolAgentflow_failure', 'humanInputAgentflow_repair_confirm'],
      ['humanInputAgentflow_repair_confirm', 'toolAgentflow_repair_propose'],
      ['toolAgentflow_repair_propose', 'toolAgentflow_repair_ready'],
      ['toolAgentflow_repair_ready', 'humanInputAgentflow_repair_activate']
    ]
  },
  {
    id: 'RESULT_RETRIEVAL',
    requiredNodes: [
      'toolAgentflow_i10_v3_result_inbox',
      'toolAgentflow_i10_v3_result_task',
      'toolAgentflow_i10_v3_result_grant',
      'directReplyAgentflow_i10_v3_result_download'
    ],
    requiredPaths: [
      ['toolAgentflow_i10_v3_result_task', 'toolAgentflow_i10_v3_result_grant'],
      ['toolAgentflow_i10_v3_result_grant', 'directReplyAgentflow_i10_v3_result_download']
    ]
  }
]

const plannedCapabilities = []

module.exports = { schemaVersion, generationAuthority, activeCapabilities, plannedCapabilities }
