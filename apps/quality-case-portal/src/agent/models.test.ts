import { describe, expect, it } from 'vitest';
import { modelCheckInput, selectModel } from './models';
const original = { id: 'model-one', version: 1, displayName: '原模型', model: 'original', baseUrl: 'https://model.invalid/v1', keyConfigured: true, isDefault: true };
const next = { ...original, id: 'model-two', model: 'next', isDefault: false };
describe('manual next-task model selection', () => {
  it('reads the real default only before a manual selection', () => {
    expect(selectModel([original, next])).toBe(original);
    expect(selectModel([original, next], next)).toBe(next);
  });
  it('does not silently move a selected version to a new version or another default', () => {
    expect(selectModel([{ ...original, version: 2 }, next], original)).toBeUndefined();
    expect(selectModel([original, next], { id: 'removed', version: 1 })).toBeUndefined();
    expect(selectModel([{ ...original, keyConfigured: false }])).toBeUndefined();
  });
  it('checks the current endpoint with new key OR the exact saved key version', () => {
    expect(modelCheckInput('edited', 'https://edited.invalid/v1', '', original)).toEqual({ model: 'edited', baseUrl: 'https://edited.invalid/v1', profileId: original.id, profileVersion: 1 });
    expect(modelCheckInput('edited', 'https://edited.invalid/v1', 'synthetic-test-key', original)).toEqual({ model: 'edited', baseUrl: 'https://edited.invalid/v1', apiKey: 'synthetic-test-key' });
    expect(modelCheckInput('new', 'https://new.invalid/v1', '')).toEqual({ model: 'new', baseUrl: 'https://new.invalid/v1' });
  });
});
