import path from 'node:path';
import { HarnessError } from '../errors';

export const FLOWISE_ATTACHMENT_REF_PREFIX = 'flowise-v1.';

export interface FlowiseAttachmentReference {
  version: 1;
  orgId: string;
  chatflowId: string;
  chatId: string;
  filename: string;
}

const safeSegment = /^[A-Za-z0-9_-]{8,100}$/;

function validate(reference: FlowiseAttachmentReference): FlowiseAttachmentReference {
  if (reference.version !== 1
    || !safeSegment.test(reference.orgId)
    || !safeSegment.test(reference.chatflowId)
    || !safeSegment.test(reference.chatId)) {
    throw new HarnessError(400, 'I10_FLOWISE_FILE_REF_INVALID', 'CONTRACT', 'Flowise附件引用无效。');
  }
  if (!reference.filename
    || reference.filename.length > 260
    || path.basename(reference.filename) !== reference.filename
    || /[\u0000-\u001f]/.test(reference.filename)) {
    throw new HarnessError(400, 'I10_ATTACHMENT_FILENAME_INVALID', 'CONTRACT', '附件文件名无效。');
  }
  return reference;
}

export function encodeFlowiseAttachmentReference(reference: FlowiseAttachmentReference): string {
  const valid = validate(reference);
  return `${FLOWISE_ATTACHMENT_REF_PREFIX}${Buffer.from(JSON.stringify(valid), 'utf8').toString('base64url')}`;
}

export function decodeFlowiseAttachmentReference(value: string): FlowiseAttachmentReference | undefined {
  if (!value.startsWith(FLOWISE_ATTACHMENT_REF_PREFIX)) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value.slice(FLOWISE_ATTACHMENT_REF_PREFIX.length), 'base64url').toString('utf8')) as Record<string, unknown>;
    if (Object.keys(decoded).sort().join(',') !== 'chatId,chatflowId,filename,orgId,version') throw new Error('shape');
    return validate(decoded as unknown as FlowiseAttachmentReference);
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(400, 'I10_FLOWISE_FILE_REF_INVALID', 'CONTRACT', 'Flowise附件引用无效。');
  }
}
