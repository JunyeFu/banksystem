import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { parse as parseCsv } from 'csv-parse/sync';
import { caseDraftSchema, type CaseDraft } from './schemas';
import { sha256 } from '../utils';

const MAX_CASES = 1000;
const HEADER_ALIASES = Object.freeze({
  title: ['title', 'case', 'case_name', '用例名称', '案例名称', '标题'],
  objective: ['objective', 'goal', '测试目标', '目标'],
  summary: ['summary', 'description', '描述', '摘要'],
  targetSystem: ['target_system', 'system', '目标系统', '被测系统'],
  entryUrl: ['entry_url', 'url', '入口地址', '入口url'],
  preconditions: ['preconditions', '前置条件'],
  steps: ['steps', '操作步骤', '测试步骤', '执行步骤'],
  expected: ['expected', 'expected_result', '预期结果'],
  assertions: ['assertions', '断言', '检查点']
});

type RawRecord = Record<string, unknown>;
export type CaseFileFieldMapping = { sourceField: string; canonicalField: string; matchType: 'ALIAS' | 'UNMAPPED' };
export type CaseFileRecordError = { ordinal: number; errorCode: string; fieldName?: string; recordHash: string };
export type ParsedCaseFile = {
  sourceHash: string;
  drafts: CaseDraft[];
  items: Array<{ ordinal: number; draft: CaseDraft }>;
  fieldMappings: CaseFileFieldMapping[];
  errors: CaseFileRecordError[];
};

async function validateOfficeArchive(source: Buffer, extension: '.xlsx' | '.docx'): Promise<void> {
  let archive: JSZip;
  try { archive = await JSZip.loadAsync(source, { checkCRC32: true }); }
  catch { throw new Error('I10_CASE_FILE_ARCHIVE_INVALID'); }
  const entries = Object.values(archive.files);
  if (entries.length === 0 || entries.length > 10_000) throw new Error('I10_CASE_FILE_ARCHIVE_INVALID');
  let uncompressedBytes = 0;
  for (const entry of entries) {
    const unsafeName = (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    const normalized = unsafeName.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error('I10_CASE_FILE_ARCHIVE_PATH_INVALID');
    if (/(^|\/)(?:vbaProject\.bin|macros?|activex)(?:\/|$)/i.test(normalized)) throw new Error('I10_CASE_FILE_ACTIVE_CONTENT_REJECTED');
    const size = Number((entry as unknown as {_data?: {uncompressedSize?: number}})._data?.uncompressedSize ?? 0);
    if (!Number.isFinite(size) || size < 0) throw new Error('I10_CASE_FILE_ARCHIVE_INVALID');
    uncompressedBytes += size;
    if (uncompressedBytes > 100 * 1024 * 1024) throw new Error('I10_CASE_FILE_ARCHIVE_EXPANSION_LIMIT');
  }
  const requiredEntry = extension === '.xlsx' ? 'xl/workbook.xml' : 'word/document.xml';
  if (!archive.file(requiredEntry)) throw new Error('I10_CASE_FILE_ARCHIVE_STRUCTURE_INVALID');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function canonicalField(sourceField: string): string | undefined {
  const normalized = normalizeHeader(sourceField);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.some(alias => normalizeHeader(alias) === normalized))?.[0];
}

function collectFieldMappings(records: RawRecord[]): CaseFileFieldMapping[] {
  const mappings = new Map<string, CaseFileFieldMapping>();
  for (const sourceField of records.flatMap(record => Object.keys(record))) {
    const canonical = canonicalField(sourceField);
    const key = `${normalizeHeader(sourceField)}:${canonical ?? ''}`;
    if (!mappings.has(key)) mappings.set(key, { sourceField, canonicalField: canonical ?? '', matchType: canonical ? 'ALIAS' : 'UNMAPPED' });
  }
  return [...mappings.values()].sort((left, right) => left.sourceField.localeCompare(right.sourceField, 'zh-CN'));
}

function field(record: RawRecord, aliases: readonly string[]): string | undefined {
  const entries = new Map(Object.entries(record).map(([key, value]) => [normalizeHeader(key), value]));
  for (const alias of aliases) {
    const value = entries.get(normalizeHeader(alias));
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/\r?\n|\s*;\s*|\s*；\s*|\s*\|\s*/)
    .map(item => item.replace(/^\s*(?:\d+[.)、]|[-*])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 50);
}

function recordToDraft(record: RawRecord, ordinal: number, sourceRef: string, sourceHash: string,
  credentialRef?: string, targetSystemHint?: string, entryUrlHint?: string): CaseDraft {
  const title = field(record, HEADER_ALIASES.title) ?? `待确认案例 ${ordinal}`;
  const objective = field(record, HEADER_ALIASES.objective) ?? field(record, HEADER_ALIASES.summary) ?? title;
  const summary = field(record, HEADER_ALIASES.summary) ?? objective;
  const targetSystem = field(record, HEADER_ALIASES.targetSystem) ?? targetSystemHint;
  const entryUrl = field(record, HEADER_ALIASES.entryUrl) ?? entryUrlHint;
  const rawSteps = list(field(record, HEADER_ALIASES.steps));
  const expected = list(field(record, HEADER_ALIASES.expected));
  const steps = rawSteps.map((action, index) => ({ action, expected: expected[index] ?? expected[0] ?? '待用户确认预期结果' }));
  const assertions = list(field(record, HEADER_ALIASES.assertions));
  if (assertions.length === 0 && expected.length > 0) assertions.push(...expected);
  const missingFields: string[] = [];
  if (!targetSystem) missingFields.push('targetSystem');
  if (!entryUrl) missingFields.push('entryUrl');
  if (steps.length === 0) missingFields.push('steps');
  if (assertions.length === 0) missingFields.push('assertions');
  if (!credentialRef) missingFields.push('credentialRef');
  const completeness = Math.max(0, 1 - missingFields.length / 5);
  return caseDraftSchema.parse({
    schemaVersion: 'hengzhun-i10-case-draft-v1',
    title,
    objective,
    summary,
    ...(targetSystem ? { targetSystem } : {}),
    ...(entryUrl ? { entryUrl } : {}),
    preconditions: list(field(record, HEADER_ALIASES.preconditions)),
    steps: steps.length > 0 ? steps : [{ action: '待用户补充操作步骤', expected: '待用户确认预期结果' }],
    assertions: assertions.length > 0 ? assertions : ['待用户补充断言'],
    ...(credentialRef ? { credentialRef } : {}),
    source: { inputType: 'CASE_FILE', sourceRef, sourceHash, provenanceSummary: `由受控案例文件第 ${ordinal} 项解析` },
    confidence: Number((0.5 + completeness * 0.45).toFixed(2)),
    missingFields,
    confirmationStatus: 'WAITING_USER',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
    executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY',
    evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  });
}

function jsonRecords(value: unknown): RawRecord[] {
  const source = Array.isArray(value) ? value : (value && typeof value === 'object' && Array.isArray((value as { cases?: unknown }).cases))
    ? (value as { cases: unknown[] }).cases : [value];
  return source.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('I10_CASE_FILE_JSON_ITEM_INVALID');
    return item as RawRecord;
  });
}

function docxTextToRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let current: RawRecord = {};
  const titleAliases = new Set(HEADER_ALIASES.title.map(normalizeHeader));
  for (const line of text.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    const match = line.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
    if (match) {
      const key = match[1] as string;
      if (titleAliases.has(normalizeHeader(key)) && Object.keys(current).length > 0) {
        records.push(current);
        current = {};
      }
      current[key] = match[2];
    } else {
      current.steps = current.steps ? `${current.steps}\n${line}` : line;
    }
  }
  if (Object.keys(current).length > 0) records.push(current);
  return records;
}

export async function parseCaseFile(filePath: string, options: {
  flowiseFileRef: string;
  credentialRef?: string;
  targetSystemHint?: string;
  entryUrlHint?: string;
}): Promise<ParsedCaseFile> {
  const extension = path.extname(filePath).toLowerCase();
  if (['.xls', '.xlsm', '.xltm', '.docm'].includes(extension)) throw new Error('I10_CASE_FILE_ACTIVE_CONTENT_REJECTED');
  if (!['.xlsx', '.csv', '.docx', '.json'].includes(extension)) throw new Error('I10_CASE_FILE_FORMAT_UNSUPPORTED');
  const source = await import('node:fs/promises').then(fs => fs.readFile(filePath));
  if (source.byteLength === 0 || source.byteLength > 20 * 1024 * 1024) throw new Error('I10_CASE_FILE_SIZE_INVALID');
  if (extension === '.xlsx' || extension === '.docx') await validateOfficeArchive(source, extension);
  const sourceHash = sha256(source);
  let records: RawRecord[];
  if (extension === '.csv') {
    records = parseCsv(source, { bom: true, columns: true, skip_empty_lines: true, relax_column_count: false, max_record_size: 64 * 1024 }) as RawRecord[];
  } else if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(source as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('I10_CASE_FILE_WORKSHEET_MISSING');
    const headers = sheet.getRow(1).values as unknown[];
    records = [];
    let overflow = false;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: RawRecord = {};
      row.eachCell((cell, columnNumber) => {
        const header = String(headers[columnNumber] ?? '').trim();
        if (header) record[header] = typeof cell.value === 'object' && cell.value && 'text' in cell.value ? String(cell.value.text) : cell.text;
      });
      if (Object.values(record).some(value => String(value ?? '').trim())) {
        if (records.length >= MAX_CASES) overflow = true;
        else records.push(record);
      }
    });
    if (overflow) throw new Error('I10_CASE_FILE_CASE_COUNT_INVALID');
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: source });
    records = docxTextToRecords(result.value);
  } else {
    records = jsonRecords(JSON.parse(source.toString('utf8')));
  }
  if (records.length === 0 || records.length > MAX_CASES) throw new Error('I10_CASE_FILE_CASE_COUNT_INVALID');
  const items: Array<{ ordinal: number; draft: CaseDraft }> = [];
  const errors: CaseFileRecordError[] = [];
  records.forEach((record, index) => {
    const ordinal = index + 1;
    try {
      items.push({ ordinal, draft: recordToDraft(record, ordinal, options.flowiseFileRef, sourceHash,
        options.credentialRef, options.targetSystemHint, options.entryUrlHint) });
    } catch {
      errors.push({ ordinal, errorCode: 'I10_CASE_FILE_RECORD_INVALID', recordHash: sha256(JSON.stringify(record)) });
    }
  });
  if (items.length === 0) throw new Error('I10_CASE_FILE_NO_VALID_CASES');
  return { sourceHash, drafts: items.map(item => item.draft), items, fieldMappings: collectFieldMappings(records), errors };
}
