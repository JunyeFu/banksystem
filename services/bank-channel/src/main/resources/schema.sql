CREATE TABLE IF NOT EXISTS idempotency_record (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  request_hash CHAR(64) NOT NULL,
  response_body TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_identity (
  subject VARCHAR(128) PRIMARY KEY,
  fineract_client_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transfer (
  transfer_id UUID PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE REFERENCES idempotency_record(idempotency_key),
  source_account_id VARCHAR(64) NOT NULL,
  destination_account_id VARCHAR(64) NOT NULL,
  amount NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  status VARCHAR(32) NOT NULL,
  score INTEGER,
  scoring_reason VARCHAR(240),
  core_reference VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS beneficiary (
  beneficiary_id UUID PRIMARY KEY,
  subject VARCHAR(128) NOT NULL,
  account_token CHAR(64) NOT NULL,
  account_last4 VARCHAR(4) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject, account_token)
);
CREATE TABLE IF NOT EXISTS transfer_outbox (
  event_id UUID PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES transfer(transfer_id),
  event_type VARCHAR(96) NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS inbox_event (
  consumer_name VARCHAR(96) NOT NULL,
  event_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE IF NOT EXISTS clearing_payment (
  clearing_id UUID PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  transfer_id UUID NOT NULL,
  scenario VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 0,
  last_sequence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS risk_decision (
  decision_id UUID PRIMARY KEY,
  transfer_id UUID NOT NULL,
  decision VARCHAR(16) NOT NULL,
  reason VARCHAR(240) NOT NULL,
  maker_subject VARCHAR(128) NOT NULL,
  checker_subject VARCHAR(128),
  approval_reason VARCHAR(240),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loan_application (
  application_id UUID PRIMARY KEY,
  subject VARCHAR(128) NOT NULL,
  fineract_client_id BIGINT,
  requested_amount NUMERIC(20,4) NOT NULL CHECK (requested_amount > 0),
  term_months INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 480),
  purpose VARCHAR(240) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loan_document (
  document_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES loan_application(application_id),
  subject VARCHAR(128) NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  storage_ref VARCHAR(240) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loan_approval (
  approval_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES loan_application(application_id),
  maker_subject VARCHAR(128) NOT NULL,
  checker_subject VARCHAR(128),
  status VARCHAR(24) NOT NULL,
  reason VARCHAR(240) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS eod_run (
  run_id UUID PRIMARY KEY,
  business_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL,
  reconciliation_status VARCHAR(24) NOT NULL,
  reason VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
