import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('Chinese display spacing is allowed while irregular source-code spacing is still rejected', async () => {
  const eslint = new ESLint();
  const [jsx] = await eslint.lintText('export const label = <span>账户\u3000余额</span>;', { filePath: 'src/display.tsx' });
  const [template] = await eslint.lintText('export const label = `账户\u3000余额`;', { filePath: 'src/display.ts' });
  const [code] = await eslint.lintText('export const\u3000value = 1;', { filePath: 'src/source.ts' });
  expect(jsx!.errorCount).toBe(0);
  expect(template!.errorCount).toBe(0);
  expect(code!.messages.some(message => message.ruleId === 'no-irregular-whitespace')).toBe(true);
});
