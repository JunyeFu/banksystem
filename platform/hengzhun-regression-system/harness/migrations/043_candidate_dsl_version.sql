-- The builder already emits V2 for GENERIC_WEB; the old column forced V1.
-- Native column replacement preserves the parent table and its foreign keys.
DROP TRIGGER trg_i8_candidate_source_immutable;
ALTER TABLE i8_script_candidates DROP COLUMN dsl_version;
ALTER TABLE i8_script_candidates ADD COLUMN dsl_version TEXT NOT NULL
  DEFAULT 'HENGZHUN_DSL_V1' CHECK (dsl_version IN ('HENGZHUN_DSL_V1','HENGZHUN_DSL_V2'));
UPDATE i8_script_candidates SET dsl_version='HENGZHUN_DSL_V2'
  WHERE json_extract(dsl_json,'$.schemaVersion')='HENGZHUN_DSL_V2';
CREATE TRIGGER trg_i8_candidate_source_immutable
BEFORE UPDATE OF executable_plan_id, script_id, script_version, dsl_version, dsl_json, dsl_hash,
  generator_version, relative_directory, script_sha256, manifest_json, manifest_sha256, source_chain_hash
ON i8_script_candidates
BEGIN SELECT RAISE(ABORT, 'I8_SCRIPT_CANDIDATE_IMMUTABLE'); END;
