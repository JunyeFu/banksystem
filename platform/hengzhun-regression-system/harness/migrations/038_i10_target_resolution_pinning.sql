ALTER TABLE i10_target_profiles ADD COLUMN resolved_addresses_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(resolved_addresses_json) AND json_type(resolved_addresses_json) = 'object');
