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
