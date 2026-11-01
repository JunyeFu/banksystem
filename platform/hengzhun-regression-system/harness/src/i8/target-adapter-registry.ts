import { canonicalJson, sha256 } from '../utils';
import bankAuthentication from '../../../contracts/adapters/fuxing-bank-demo-auth-v2.json';
import operationsAuthentication from '../../../contracts/adapters/fuxing-bank-operations-auth-v1.json';
export const FUXING_BANK_AUTHENTICATION = bankAuthentication;

/**
 * A target adapter is intentionally opt-in.  It must never be inferred from a
 * product name, host, URL path, page text, or the controller's prose.
 */
export type TargetAdapterBinding = {
  adapterId: string;
  adapterVersion: string;
  manifestHash: string;
};

const fuxingManifest = bankAuthentication;

export const FUXING_BANK_DEMO_ADAPTER: TargetAdapterBinding = Object.freeze({
  adapterId: fuxingManifest.adapterId,
  adapterVersion: fuxingManifest.adapterVersion,
  manifestHash: sha256(canonicalJson(fuxingManifest))
});

export const FUXING_BANK_OPERATIONS_ADAPTER: TargetAdapterBinding = Object.freeze({
  adapterId: operationsAuthentication.adapterId, adapterVersion: operationsAuthentication.adapterVersion,
  manifestHash: sha256(canonicalJson(operationsAuthentication))
});

export function resolveTargetAdapterBinding(value: unknown): TargetAdapterBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<TargetAdapterBinding>;
  if(candidate.adapterId===FUXING_BANK_OPERATIONS_ADAPTER.adapterId&&candidate.adapterVersion===FUXING_BANK_OPERATIONS_ADAPTER.adapterVersion&&candidate.manifestHash===FUXING_BANK_OPERATIONS_ADAPTER.manifestHash)return FUXING_BANK_OPERATIONS_ADAPTER;
  if (candidate.adapterId === FUXING_BANK_DEMO_ADAPTER.adapterId &&
      candidate.adapterVersion === FUXING_BANK_DEMO_ADAPTER.adapterVersion &&
      candidate.manifestHash === FUXING_BANK_DEMO_ADAPTER.manifestHash) {
    return FUXING_BANK_DEMO_ADAPTER;
  }
  return undefined;
}

export function isFuxingBankDemoAdapter(value: unknown): boolean {
  return resolveTargetAdapterBinding(value)?.adapterId===FUXING_BANK_DEMO_ADAPTER.adapterId;
}

export function authenticationForTargetAdapter(value: unknown) {
  const binding=resolveTargetAdapterBinding(value);
  if(binding?.adapterId===FUXING_BANK_OPERATIONS_ADAPTER.adapterId)return operationsAuthentication;
  if(binding?.adapterId===FUXING_BANK_DEMO_ADAPTER.adapterId)return bankAuthentication;
  return undefined;
}
