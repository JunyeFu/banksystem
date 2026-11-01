import { type AgentInput } from './api';
import { type Model } from './turn';

export type ModelSelection = { id: string; version: number };
export const selectModel = (models: Model[], selected?: ModelSelection) => selected
  ? models.find(model => model.id === selected.id && model.version === selected.version && model.keyConfigured)
  : models.find(model => model.isDefault && model.keyConfigured);
export function modelCheckInput(model: string, baseUrl: string, apiKey: string, profile?: Model): NonNullable<AgentInput<'checkAgentModel'>['body']> {
  return { model, baseUrl, ...(apiKey ? { apiKey } : profile ? { profileId: profile.id, profileVersion: profile.version } : {}) };
}
