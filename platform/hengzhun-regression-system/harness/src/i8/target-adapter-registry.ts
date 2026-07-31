import { canonicalJson, sha256 } from '../utils';

/**
 * A target adapter is intentionally opt-in.  It must never be inferred from a
 * product name, host, URL path, page text, or the controller's prose.
 */
export type TargetAdapterBinding = {
  adapterId: string;
  adapterVersion: string;
  manifestHash: string;
};

const fuxingManifest = {
  adapterId: 'fuxing-bank-demo',
  adapterVersion: '1.0.0',
  executionEngine: 'TARGET_ADAPTER',
  supportedCapabilities: ['AUTHENTICATION', 'NAVIGATION', 'ASSERTION', 'EVIDENCE_CAPTURE'],
  explicitOnly: true
} as const;

export const FUXING_BANK_DEMO_ADAPTER: TargetAdapterBinding = Object.freeze({
  adapterId: fuxingManifest.adapterId,
  adapterVersion: fuxingManifest.adapterVersion,
  manifestHash: sha256(canonicalJson(fuxingManifest))
});

export function resolveTargetAdapterBinding(value: unknown): TargetAdapterBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<TargetAdapterBinding>;
  if (candidate.adapterId === FUXING_BANK_DEMO_ADAPTER.adapterId &&
      candidate.adapterVersion === FUXING_BANK_DEMO_ADAPTER.adapterVersion &&
      candidate.manifestHash === FUXING_BANK_DEMO_ADAPTER.manifestHash) {
    return FUXING_BANK_DEMO_ADAPTER;
  }
  return undefined;
}

export function isFuxingBankDemoAdapter(value: unknown): boolean {
  return Boolean(resolveTargetAdapterBinding(value));
}
