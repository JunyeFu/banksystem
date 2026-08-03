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

  getMetadata(namespace: string, artifactId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT artifact_id, artifact_type, relative_path, sha256, byte_size,
               media_type, redaction_status, metadata_json, created_at
        FROM artifacts
        WHERE namespace = ? AND artifact_id = ?
      `).get(namespace, artifactId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'ARTIFACT_NOT_FOUND', 'DOMAIN', 'Artifact 不存在。');
      return {
        artifactId: row.artifact_id,
        type: row.artifact_type,
        relativePath: row.relative_path,
        sha256: row.sha256,
        byteSize: row.byte_size,
        mediaType: row.media_type,
        redactionStatus: row.redaction_status,
        metadata: JSON.parse(String(row.metadata_json)),
        createdAt: row.created_at
      };
    });
  }

  read(namespace: string, artifactId: string): { content: Buffer; metadata: Record<string, unknown> } {
    const metadata = this.getMetadata(namespace, artifactId);
    if (metadata.redactionStatus === 'QUARANTINED') {
      throw new HarnessError(409, 'ARTIFACT_QUARANTINED', 'SECURITY', '隔离制品不可下载。', false, false);
    }
    const relativePath = String(metadata.relativePath);
    const absolutePath = path.resolve(this.root, ...relativePath.split('/'));
    const resolvedRoot = `${path.resolve(this.root)}${path.sep}`;
    if (!absolutePath.startsWith(resolvedRoot) || !fs.existsSync(absolutePath)) {
      throw new HarnessError(409, 'ARTIFACT_CONTENT_MISSING', 'EVIDENCE', '制品内容缺失。', false, true);
    }
    const content = fs.readFileSync(absolutePath);
    if (sha256(content) !== metadata.sha256) {
      content.fill(0);
      throw new HarnessError(409, 'ARTIFACT_HASH_MISMATCH', 'EVIDENCE', '制品Hash校验失败。', false, false);
    }
    return { content, metadata };
  }
}
