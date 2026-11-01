import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentClient } from './api';

const bootstrap = { csrfToken: 'a'.repeat(64), status: 'NOT_READY', environment: 'LOCAL', releaseIdentityHash: null, blockingReasons: ['AGENT_MODEL_CONFIGURATION_REQUIRED'] };
afterEach(() => vi.unstubAllGlobals());
describe('generated same-origin Agent transport', () => {
  it('imports binary images with CSRF and encoded filename, not a path or JSON body', async () => {
    const receipt = { attachmentRef: 'att_isolated_image', originalFilename: '截图.png', sha256: 'a'.repeat(64), size: 3, mediaType: 'image/png' };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(bootstrap)).mockResolvedValueOnce(Response.json(receipt));
    vi.stubGlobal('fetch', fetcher); const client = createAgentClient(); await client.bootstrap();
    const file = new File(['png'], '截图.png', { type: 'image/png' });
    expect(await client.importAttachment(file)).toEqual(receipt);
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe('/api/agent/v1/attachments'); expect(init.body).toBe(file);
    expect(init.headers['content-type']).toBe('image/png'); expect(init.headers['x-hengzhun-csrf']).toBe(bootstrap.csrfToken);
    expect(Buffer.from(init.headers['X-Hengzhun-Filename'], 'base64url').toString()).toBe('截图.png');
    expect(init.headers.authorization).toBeUndefined();
  });
  it('downloads only through the generated relative proxy and preserves safe error handling', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('proof')).mockResolvedValueOnce(Response.json({ code: 'PRIVATE_TOKEN_VALUE', detail: 'secret' }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher); const invalidate = vi.fn(), client = createAgentClient(invalidate);
    expect(await (await client.downloadArtifact({ turnId: 'turn/id', artifactId: 'artifact/id' })).text()).toBe('proof');
    expect(fetcher.mock.calls[0][0]).toBe('/api/agent/v1/turns/turn%2Fid/artifacts/artifact%2Fid');
    await expect(client.downloadArtifact({ turnId: 'turn', artifactId: 'artifact' })).rejects.toMatchObject({ code: 'AGENT_REQUEST_FAILED', status: 403 });
    expect(invalidate).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bootstrap is GET-only, credential-free and retains the real NOT_READY reason', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(bootstrap)); vi.stubGlobal('fetch', fetcher);
    expect(await createAgentClient().bootstrap()).toEqual(bootstrap);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/agent/v1/bootstrap');
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' } });
    expect(options.body).toBeUndefined(); expect(options.headers.authorization).toBeUndefined();
  });
  it('never writes without bootstrap; sends its CSRF only to the generated relative route', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(bootstrap)).mockResolvedValueOnce(Response.json({ id: 'conversation' }));
    vi.stubGlobal('fetch', fetcher); const client = createAgentClient();
    await expect(client.request('createAgentConversation', { body: { title: '测试' } })).rejects.toMatchObject({ code: 'AGENT_CONNECTION_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled(); await client.bootstrap();
    await client.request('createAgentConversation', { body: { title: '测试' } });
    expect(fetcher.mock.calls[1]).toEqual(['/api/agent/v1/conversations', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-hengzhun-csrf': bootstrap.csrfToken }), body: '{"title":"测试"}' })]);
  });
  it('403 invalidates the page binding and does not replay POST or refresh automatically', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(bootstrap)).mockResolvedValueOnce(Response.json({ code: 'AGENT_ORIGIN_OR_CSRF_FORBIDDEN' }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher); const invalidated = vi.fn(), client = createAgentClient(invalidated);
    await client.bootstrap();
    await expect(client.request('createAgentConversation', { body: { title: '测试' } })).rejects.toMatchObject({ status: 403 });
    await expect(client.request('createAgentConversation', { body: { title: '测试' } })).rejects.toMatchObject({ code: 'AGENT_CONNECTION_REQUIRED' });
    expect(invalidated).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('encodes path and query parameters from generated operations', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}))); vi.stubGlobal('fetch', fetcher);
    const client = createAgentClient();
    await client.request('getAgentConversation', { path: { conversationId: 'a/b' } });
    await client.request('listAgentConversations', { query: { q: '查询 余额', limit: 10 } });
    expect(fetcher.mock.calls[0][0]).toBe('/api/agent/v1/conversations/a%2Fb');
    expect(fetcher.mock.calls[1][0]).toBe('/api/agent/v1/conversations?q=%E6%9F%A5%E8%AF%A2+%E4%BD%99%E9%A2%9D&limit=10');
  });
  it.each([503, 500, 409])('HTTP %i is returned once, not retried', async status => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: 'AGENT_DEPENDENCY_UNAVAILABLE' }, { status })); vi.stubGlobal('fetch', fetcher);
    await expect(createAgentClient().bootstrap()).rejects.toMatchObject({ status }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('network failure is explicit and never leaks raw error detail', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('synthetic-private-key')); vi.stubGlobal('fetch', fetcher);
    await expect(createAgentClient().bootstrap()).rejects.toMatchObject({ code: 'AGENT_CONNECTION_UNAVAILABLE', status: 0 }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(['MODEL_HTTP_401', 'HARNESS_STATE_INVALID', 'WORKER_HEARTBEAT_NOT_READY', 'I10_MIDSCENE_MODEL_UNSUPPORTED'])('preserves the safe dependency code %s', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code, detail: 'synthetic-private-key' }, { status: 503 })));
    await expect(createAgentClient().bootstrap()).rejects.toMatchObject({ code, status: 503 });
  });
  it('non-problem response does not expose raw provider text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('synthetic-private-key', { status: 502 })));
    await expect(createAgentClient().bootstrap()).rejects.toMatchObject({ code: 'AGENT_REQUEST_FAILED', status: 502 });
  });
  it('a parallel 403 cannot be undone by an older successful bootstrap response', async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { finish = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(response).mockResolvedValueOnce(Response.json({ code: 'AGENT_HOST_FORBIDDEN' }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher); const client = createAgentClient();
    const starting = client.bootstrap();
    await expect(client.request('listAgentConversations', {})).rejects.toMatchObject({ status: 403 });
    finish(Response.json(bootstrap));
    await expect(starting).rejects.toMatchObject({ code: 'AGENT_CONNECTION_INVALIDATED' });
    await expect(client.request('createAgentConversation', { body: { title: '新对话' } })).rejects.toMatchObject({ code: 'AGENT_CONNECTION_REQUIRED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('only the latest explicit bootstrap may install a CSRF binding', async () => {
    let finish!: (response: Response) => void;
    const first = new Promise<Response>(resolve => { finish = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(Response.json({ ...bootstrap, csrfToken: 'b'.repeat(64) })).mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetcher); const client = createAgentClient();
    const older = client.bootstrap(); await client.bootstrap(); finish(Response.json(bootstrap));
    await expect(older).rejects.toMatchObject({ code: 'AGENT_CONNECTION_INVALIDATED' });
    await client.request('createAgentConversation', { body: { title: '新对话' } });
    expect(fetcher.mock.calls[2][1].headers['x-hengzhun-csrf']).toBe('b'.repeat(64));
  });
});
