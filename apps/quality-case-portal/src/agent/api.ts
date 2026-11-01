import { agentOperations, type operations } from '../generated/agent-api';

type Operation = keyof operations;
type ResponseContent<T> = T extends { content: { 'application/json': infer V } } ? V : never;
export type AgentResponse<K extends Operation> = {
  [S in keyof operations[K]['responses']]: S extends 200 | 201 | 202 ? ResponseContent<operations[K]['responses'][S]> : never;
}[keyof operations[K]['responses']];
type Input<K extends Operation> = Pick<operations[K]['parameters'], 'path' | 'query'> &
  (operations[K] extends { requestBody: { content: { 'application/json': infer B } } } ? { body: B } : { body?: never });
export type AgentInput<K extends Operation> = Input<K>;
type JsonOperation = { [K in Operation]: AgentResponse<K> extends never ? never
  : operations[K] extends { requestBody: { content: infer C } } ? 'application/json' extends keyof C ? K : never : K;
}[Operation];

export class AgentApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

// CSRF lives only in this page instance. No credentials, execution state or retries here.
export function createAgentClient(onInvalidated: () => void = () => {}) {
  let csrfToken: string | undefined;
  let bindingEpoch = 0;
  async function responseFor<K extends Operation>(id: K, input: Pick<operations[K]['parameters'], 'path' | 'query'>, init: RequestInit = {}) {
    const operation = agentOperations[id];
    const writes = operation.method !== 'GET';
    if (writes && !csrfToken) throw new AgentApiError('AGENT_CONNECTION_REQUIRED', 403);
    let url: string = operation.path;
    for (const [key, value] of Object.entries(input.path ?? {})) url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) if (value !== undefined) query.set(key, String(value));
    if (query.size) url += `?${query}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: operation.method, credentials: 'omit', cache: 'no-store',
        ...init,
        headers: { accept: 'application/json', ...(writes ? { 'x-hengzhun-csrf': csrfToken! } : {}), ...init.headers },
      });
    } catch {
      throw new AgentApiError('AGENT_CONNECTION_UNAVAILABLE', 0);
    }
    if (!response.ok) {
      if (response.status === 403) { bindingEpoch++; csrfToken = undefined; onInvalidated(); }
      // Only the bounded public problem code may reach the UI, never provider/error payloads.
      const problem: unknown = await response.json().catch(() => null);
      const code = problem && typeof problem === 'object' && 'code' in problem && typeof problem.code === 'string'
        && /^(?:AGENT|MODEL|HARNESS|MCP|WORKER|BROWSER|BANK|I10_VISION|I10_MIDSCENE)_[A-Z0-9_]{1,90}$/.test(problem.code) ? problem.code : 'AGENT_REQUEST_FAILED';
      throw new AgentApiError(code, response.status);
    }
    return response;
  }
  async function request<K extends JsonOperation>(id: K, input: Input<K>): Promise<AgentResponse<K>> {
    const writes = agentOperations[id].method !== 'GET';
    const response = await responseFor(id, input, writes ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input.body) } : {});
    return response.json();
  }
  return {
    request,
    async importAttachment(file: File): Promise<AgentResponse<'importAgentAttachment'>> {
      const filename = btoa(String.fromCharCode(...new TextEncoder().encode(file.name))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const response = await responseFor('importAgentAttachment', {}, {
        headers: { 'content-type': file.type, 'X-Hengzhun-Filename': filename }, body: file,
      });
      return response.json();
    },
    async downloadArtifact(path: NonNullable<Input<'downloadAgentArtifact'>['path']>) {
      const response = await responseFor('downloadAgentArtifact', { path }, { headers: { accept: 'application/octet-stream' } });
      return response.blob();
    },
    async bootstrap() {
      const epoch = ++bindingEpoch;
      csrfToken = undefined;
      const result = await request('getAgentBootstrap', {});
      if (epoch !== bindingEpoch) throw new AgentApiError('AGENT_CONNECTION_INVALIDATED', 403);
      csrfToken = result.csrfToken;
      return result;
    },
  };
}

export type AgentClient = ReturnType<typeof createAgentClient>;
