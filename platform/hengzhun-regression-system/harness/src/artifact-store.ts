import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
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

export interface StagedArtifact {
  artifactId: string;
  namespace: string;
  runId?: string;
  taskId?: string;
  type: CreateArtifactInput['artifactType'];
  mediaType: string;
  redactionStatus: CreateArtifactInput['redactionStatus'];
  metadataJson: string;
  sha256: string;
  byteSize: number;
  createdAt: string;
  relativePath: string;
  stagingPath: string;
  finalPath: string;
  published: boolean;
  committed: boolean;
}

export class ArtifactStore {
  constructor(private readonly database: HarnessDatabase, private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
    const stagingDirectory = path.join(root, '.staging');
    fs.mkdirSync(stagingDirectory, { recursive: true });
    // Files in .staging are never registered or downloadable. They can only
    // survive an ungraceful process exit. Remove only files old enough that
    // they cannot belong to another ArtifactStore instance staging a current
    // completion against the same governed root.
    const staleBefore = Date.now() - 24 * 60 * 60_000;
    for (const entry of fs.readdirSync(stagingDirectory, { withFileTypes: true })) {
      const pendingPath = path.join(stagingDirectory, entry.name);
      if (entry.isFile() && entry.name.endsWith('.pending') && fs.statSync(pendingPath).mtimeMs < staleBefore) {
        fs.rmSync(pendingPath, { force: true });
      }
    }
    // Never infer that a final artifact is disposable from absence in the
    // currently opened database. A misconfigured test, restore, or operator
    // process can point a different database at the same artifact root. Only
    // hidden staging files are owned by this startup-recovery protocol; final
    // files require a separately authorized, database-bound GC operation.
  }

  async create(input: CreateArtifactInput): Promise<Record<string, unknown>> {
    const staged = this.stage(input);
    try {
      await this.database.write(db => this.publishStaged(db, staged));
      staged.committed = true;
      return this.publicMetadata(staged);
    } catch (error) {
      this.discardStaged(staged);
      throw error;
    }
  }

  stage(input: CreateArtifactInput): StagedArtifact {
    const artifactId = opaqueId('art');
    const safeExtension = input.extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const namespaceDirectory = path.join(this.root, input.namespace);
    const stagingDirectory = path.join(this.root, '.staging');
    fs.mkdirSync(stagingDirectory, { recursive: true });
    const absolutePath = path.join(namespaceDirectory, `${artifactId}.${safeExtension}`);
    const stagingPath = path.join(stagingDirectory, `${artifactId}.${safeExtension}.pending`);
    const resolvedRoot = path.resolve(this.root) + path.sep;
    if (!path.resolve(absolutePath).startsWith(resolvedRoot) || !path.resolve(stagingPath).startsWith(resolvedRoot)) {
      throw new HarnessError(400, 'INVALID_ARTIFACT_PATH', 'SECURITY', 'Artifact 路径无效。');
    }
    const bytes = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8');
    fs.writeFileSync(stagingPath, bytes, { flag: 'wx', mode: 0o600 });
    const relativePath = path.relative(this.root, absolutePath).split(path.sep).join('/');
    const createdAt = nowIso();
    const digest = sha256(bytes);
    return {
      artifactId, namespace: input.namespace, runId: input.runId, taskId: input.taskId,
      type: input.artifactType, mediaType: input.mediaType, redactionStatus: input.redactionStatus,
      metadataJson: JSON.stringify(input.metadata ?? {}), sha256: digest, byteSize: bytes.byteLength,
      createdAt, relativePath, stagingPath, finalPath: absolutePath, published: false, committed: false
    };
  }

  publishStaged(db: Database.Database, staged: StagedArtifact): Record<string, unknown> {
    if (staged.published || staged.committed) throw new HarnessError(409, 'ARTIFACT_ALREADY_PUBLISHED', 'CONCURRENCY', '制品已发布，禁止重复写入。');
    fs.mkdirSync(path.dirname(staged.finalPath), { recursive: true });
    fs.renameSync(staged.stagingPath, staged.finalPath);
    staged.published = true;
    db.prepare(`
      INSERT INTO artifacts(
        artifact_id, namespace, run_id, task_id, artifact_type, relative_path,
        sha256, byte_size, media_type, redaction_status, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      staged.artifactId, staged.namespace, staged.runId ?? null, staged.taskId ?? null,
      staged.type, staged.relativePath, staged.sha256, staged.byteSize, staged.mediaType,
      staged.redactionStatus, staged.metadataJson, staged.createdAt
    );
    return this.publicMetadata(staged);
  }

  discardStaged(staged: StagedArtifact): void {
    fs.rmSync(staged.stagingPath, { force: true });
    if (!staged.committed) fs.rmSync(staged.finalPath, { force: true });
  }

  private publicMetadata(staged: StagedArtifact): Record<string, unknown> {
    return {
      artifactId: staged.artifactId,
      type: staged.type,
      sha256: staged.sha256,
      byteSize: staged.byteSize,
      mediaType: staged.mediaType,
      redactionStatus: staged.redactionStatus,
      createdAt: staged.createdAt
    };
  }

  getMetadata(namespace: string, artifactId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT artifact_id, run_id, task_id, artifact_type, relative_path, sha256, byte_size,
               media_type, redaction_status, metadata_json, created_at
        FROM artifacts
        WHERE namespace = ? AND artifact_id = ?
      `).get(namespace, artifactId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'ARTIFACT_NOT_FOUND', 'DOMAIN', 'Artifact 不存在。');
      return {
        artifactId: row.artifact_id,
        runId: row.run_id,
        taskId: row.task_id,
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

  verifyIntegrity(namespace: string, artifactId: string): Record<string, unknown> {
    const metadata = this.getMetadata(namespace, artifactId);
    const absolutePath = path.resolve(this.root, ...String(metadata.relativePath).split('/'));
    const resolvedRoot = `${path.resolve(this.root)}${path.sep}`;
    if (!absolutePath.startsWith(resolvedRoot) || !fs.existsSync(absolutePath)) {
      throw new HarnessError(409, 'ARTIFACT_CONTENT_MISSING', 'EVIDENCE', '制品内容缺失。', false, true);
    }
    const content = fs.readFileSync(absolutePath);
    const digestMatches = sha256(content) === metadata.sha256;
    const sizeMatches = content.byteLength === metadata.byteSize;
    content.fill(0);
    if (!digestMatches) throw new HarnessError(409, 'ARTIFACT_HASH_MISMATCH', 'EVIDENCE', '制品Hash校验失败。', false, false);
    if (!sizeMatches) throw new HarnessError(409, 'ARTIFACT_SIZE_MISMATCH', 'EVIDENCE', '制品大小校验失败。', false, false);
    return { ...metadata, sha256Verified: true, sizeVerified: true };
  }
}
