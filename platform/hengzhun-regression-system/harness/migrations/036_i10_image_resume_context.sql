-- Image fact confirmation resumes in a new Flowise execution.  Retain only
-- text that already crossed the entry secret guard so the authorized user can
-- continue the same business case after OCR confirmation.  Credentials and
-- image bytes remain outside this column.
ALTER TABLE i10_image_ingest_jobs
  ADD COLUMN primary_text_safe TEXT;

ALTER TABLE i10_image_ingest_jobs
  ADD COLUMN credential_ref TEXT;
