import fs from 'node:fs';
import path from 'node:path';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import { nowIso, opaqueId, sha256 } from './utils';

export interface CreateArtifactInput {
  namespace: string;
  runId?: string;
  taskId?: string;
  artifactType: 'JSON' | 'TEXT' | 'SCREENSHOT' | 'VIDEO' | 'TRACE' | 'LOG' | 'REPORT' | 'DIAGNOSTIC';
  mediaType: string;
  redactionStatus: 'NOT_REQUIRED' | 'REDACTED' | 'QUARANTINED';
  extension: string;
  content: Buffer | string;
  metadata?: Record<string, unknown>;
}

export class ArtifactStore {
  constructor(private readonly database: HarnessDatabase, private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
  }

  async create(input: CreateArtifactInput): Promise<Record<string, unknown>> {
    const artifactId = opaqueId('art');
    const safeExtension = input.extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const namespaceDirectory = path.join(this.root, input.namespace);
    fs.mkdirSync(namespaceDirectory, { recursive: true });
    const absolutePath = path.join(namespaceDirectory, `${artifactId}.${safeExtension}`);
    const resolvedRoot = path.resolve(this.root) + path.sep;
    if (!path.resolve(absolutePath).startsWith(resolvedRoot)) {
      throw new HarnessError(400, 'INVALID_ARTIFACT_PATH', 'SECURITY', 'Artifact 路径无效。');
    }
    const bytes = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8');
    fs.writeFileSync(absolutePath, bytes, { flag: 'wx', mode: 0o600 });
    const relativePath = path.relative(this.root, absolutePath).split(path.sep).join('/');
    const createdAt = nowIso();
    const digest = sha256(bytes);
    try {
      await this.database.write(db => {
        db.prepare(`
          INSERT INTO artifacts(
            artifact_id, namespace, run_id, task_id, artifact_type, relative_path,
            sha256, byte_size, media_type, redaction_status, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          artifactId, input.namespace, input.runId ?? null, input.taskId ?? null,
          input.artifactType, relativePath, digest, bytes.byteLength, input.mediaType,
          input.redactionStatus, JSON.stringify(input.metadata ?? {}), createdAt
        );
      });
    } catch (error) {
      fs.rmSync(absolutePath, { force: true });
      throw error;
    }
    return {
      artifactId,
      type: input.artifactType,
      sha256: digest,
      byteSize: bytes.byteLength,
      mediaType: input.mediaType,
      redactionStatus: input.redactionStatus,
      createdAt
    };
  }
}
