import { z } from 'zod';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import {createHash} from 'node:crypto';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().regex(/^session-[a-f0-9]{32}$/);
const envelope=z.object({schemaVersion:z.literal('hengzhun-session-envelope/v1'),cipher:z.literal('WINDOWS_DPAPI_CURRENT_USER'),
  sessionId:id,revision:z.number().int().positive(),releaseIdentityHash:hash,namespaceHash:hash,threadIdHash:hash,journeyIdHash:hash,
  ciphertextSha256:hash,ciphertextBase64:z.string().min(1),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),status:z.enum(['ACTIVE','COMPLETED','ARCHIVED'])}).strict();
export class ControllerSessionRepository {
  constructor(private readonly database:HarnessDatabase) {}
  async execute(operation:string,namespace:string,input:unknown):Promise<unknown> {
    if(operation==='save'||operation==='import') {
      const value=z.object({expectedRevision:z.number().int().nonnegative(),envelope}).strict().parse(input),e=value.envelope;
      if(e.namespaceHash!==createHash('sha256').update(namespace).digest('hex'))throw new HarnessError(403,'SESSION_NAMESPACE_FORBIDDEN','AUTHORIZATION','密文命名空间不匹配。');
      if(Buffer.byteLength(JSON.stringify(e))>120*1024)throw new HarnessError(413,'SESSION_ENVELOPE_TOO_LARGE','CONTRACT','检查点超过专用传输预算。');
      if(operation==='import' ? value.expectedRevision!==0 : e.revision!==value.expectedRevision+1)throw new HarnessError(409,'SESSION_REVISION_CONFLICT','CONTRACT','检查点版本冲突。');
      return this.database.write(db=>{
        const changes=value.expectedRevision===0
          ? db.prepare('INSERT INTO controller_sessions(namespace,session_id,revision,envelope_json,updated_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING')
            .run(namespace,e.sessionId,e.revision,JSON.stringify(e),e.updatedAt,e.expiresAt).changes
          : db.prepare('UPDATE controller_sessions SET revision=?,envelope_json=?,updated_at=?,expires_at=? WHERE namespace=? AND session_id=? AND revision=?')
            .run(e.revision,JSON.stringify(e),e.updatedAt,e.expiresAt,namespace,e.sessionId,value.expectedRevision).changes;
        if(changes!==1)throw new HarnessError(409,'SESSION_REVISION_CONFLICT','CONTRACT','检查点版本冲突。');
        return {revision:e.revision};
      });
    }
    if(operation==='load') {
      const {sessionId}=z.object({sessionId:id}).strict().parse(input);
      const row=this.database.read(db=>db.prepare('SELECT envelope_json FROM controller_sessions WHERE namespace=? AND session_id=?').get(namespace,sessionId)) as {envelope_json:string}|undefined;
      if(!row)throw new HarnessError(404,'SESSION_NOT_FOUND','CONTRACT','会话不存在。');
      return {envelope:JSON.parse(row.envelope_json)};
    }
    if(operation==='list') {
      const {cursor}=z.object({cursor:id.optional()}).strict().parse(input);
      const rows=this.database.read(db=>db.prepare('SELECT session_id,envelope_json FROM controller_sessions WHERE namespace=? AND session_id>? ORDER BY session_id LIMIT 51').all(namespace,cursor??'')) as Array<{session_id:string;envelope_json:string}>;
      return {sessions:rows.slice(0,50).map(row=>{
        const {ciphertextBase64,cipher,ciphertextSha256,...metadata}=JSON.parse(row.envelope_json);return metadata;
      }),...(rows.length>50?{nextCursor:rows[49]!.session_id}:{})};
    }
    if(operation==='purge') {
      const {before}=z.object({before:z.string().datetime()}).strict().parse(input);
      return this.database.write(db=>({deleted:db.prepare('DELETE FROM controller_sessions WHERE namespace=? AND expires_at<=?').run(namespace,before).changes}));
    }
    throw new HarnessError(404,'SESSION_OPERATION_INVALID','CONTRACT','会话操作不存在。');
  }
}
