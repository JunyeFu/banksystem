import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { nowIso } from './utils';

export interface DatabaseOptions {
  databasePath: string;
  migrationsDirectory: string;
  backupDirectory: string;
  busyTimeoutMs?: number;
}

export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}

export class HarnessDatabase {
  readonly connection: Database.Database;
  readonly writes = new WriteQueue();

  private constructor(private readonly options: DatabaseOptions) {
    fs.mkdirSync(path.dirname(options.databasePath), { recursive: true });
    fs.mkdirSync(options.backupDirectory, { recursive: true });
    this.connection = new Database(options.databasePath);
    this.connection.pragma('journal_mode = WAL');
    this.connection.pragma('foreign_keys = ON');
    this.connection.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
    this.connection.pragma('synchronous = FULL');
    this.connection.pragma('trusted_schema = OFF');
  }

  static async open(options: DatabaseOptions): Promise<HarnessDatabase> {
    const database = new HarnessDatabase(options);
    try {
      await database.migrate();
      const result = database.integrityCheck();
      if (result.length !== 1 || result[0] !== 'ok') {
        throw new Error(`SQLITE_INTEGRITY_FAILED: ${result.join('; ')}`);
      }
      return database;
    } catch (error) {
      database.connection.close();
      throw error;
    }
  }

  private async migrate(): Promise<void> {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const applied = new Map<number, { name: string; checksum: string }>(
      (this.connection.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all() as Array<{version: number; name: string; checksum: string}>)
        .map(row => [row.version, { name: row.name, checksum: row.checksum }])
    );
    const migrations = fs.readdirSync(this.options.migrationsDirectory)
      .filter(name => /^\d+_.+\.sql$/.test(name))
      .sort()
      .map(name => {
        const version = Number(name.split('_', 1)[0]);
        const sql = fs.readFileSync(path.join(this.options.migrationsDirectory, name), 'utf8');
        const checksum = require('node:crypto').createHash('sha256').update(sql).digest('hex') as string;
        return { version, name, sql, checksum };
      });

    for (const migration of migrations) {
      const previous = applied.get(migration.version);
      if (previous) {
        if (previous.name !== migration.name || previous.checksum !== migration.checksum) {
          throw new Error(`MIGRATION_DRIFT: ${migration.name}`);
        }
        continue;
      }
      if (applied.size > 0) await this.createBackup(`pre-migration-${migration.version}`);
      const apply = this.connection.transaction(() => {
        this.connection.exec(migration.sql);
        this.connection.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
          .run(migration.version, migration.name, migration.checksum, nowIso());
      });
      apply.immediate();
      applied.set(migration.version, { name: migration.name, checksum: migration.checksum });
    }
  }

  async write<T>(operation: (db: Database.Database) => T): Promise<T> {
    return this.writes.enqueue(() => {
      const transaction = this.connection.transaction(() => operation(this.connection));
      return transaction.immediate();
    });
  }

  read<T>(operation: (db: Database.Database) => T): T {
    return operation(this.connection);
  }

  integrityCheck(): string[] {
    return (this.connection.pragma('integrity_check') as Array<{ integrity_check: string }>).map(row => row.integrity_check);
  }

  quickCheck(): string[] {
    return (this.connection.pragma('quick_check') as Array<{ quick_check: string }>).map(row => row.quick_check);
  }

  migrationStatus(): { appliedVersion: number; expectedVersion: number; pending: number[] } {
    const expected = fs.readdirSync(this.options.migrationsDirectory)
      .filter(name => /^\d+_.+\.sql$/.test(name))
      .map(name => Number(name.split('_', 1)[0]))
      .sort((left, right) => left - right);
    const applied = (this.connection.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>)
      .map(row => row.version);
    const appliedSet = new Set(applied);
    return {
      appliedVersion: applied.at(-1) ?? 0,
      expectedVersion: expected.at(-1) ?? 0,
      pending: expected.filter(version => !appliedSet.has(version))
    };
  }

  async createBackup(label = 'manual'): Promise<string> {
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.options.backupDirectory, `${timestamp}-${safeLabel}.sqlite`);
    await this.connection.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    try {
      const result = (backup.pragma('integrity_check') as Array<{ integrity_check: string }>).map(row => row.integrity_check);
      if (result.length !== 1 || result[0] !== 'ok') throw new Error('SQLITE_BACKUP_INTEGRITY_FAILED');
    } finally {
      backup.close();
    }
    return backupPath;
  }

  async close(): Promise<void> {
    await this.writes.idle();
    this.connection.pragma('wal_checkpoint(TRUNCATE)');
    this.connection.close();
  }
}
