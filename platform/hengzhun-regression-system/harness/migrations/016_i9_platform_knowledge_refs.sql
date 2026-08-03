CREATE TABLE i9_knowledge_snapshot_refs (
  snapshot_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform = 'FLOWISE'),
  platform_resource_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  citation_ids_json TEXT NOT NULL CHECK (json_valid(citation_ids_json)),
  registered_at TEXT NOT NULL,
  UNIQUE (namespace, content_hash)
) STRICT;

CREATE INDEX idx_i9_knowledge_snapshot_namespace ON i9_knowledge_snapshot_refs(namespace, registered_at DESC);

CREATE TRIGGER trg_i9_knowledge_snapshot_immutable
BEFORE UPDATE ON i9_knowledge_snapshot_refs
BEGIN
  SELECT RAISE(ABORT, 'I9_KNOWLEDGE_SNAPSHOT_REF_IMMUTABLE');
END;

CREATE TRIGGER trg_i9_knowledge_snapshot_no_delete
BEFORE DELETE ON i9_knowledge_snapshot_refs
BEGIN
  SELECT RAISE(ABORT, 'I9_KNOWLEDGE_SNAPSHOT_REF_IMMUTABLE');
END;
