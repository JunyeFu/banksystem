import http from 'node:http'
import { Readable } from 'node:stream'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createAgentWorkbenchHandler, WorkbenchError } from './workbench-http.mjs'

export async function startWorkbenchServer({ workbench, staticRoot, port = 18790, onListening }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new WorkbenchError('AGENT_PORT_INVALID', 400)
  let handle, origin
  const server = http.createServer(async (request, response) => {
    try {
      const target = new URL(request.url, origin)
      if (target.pathname.startsWith('/api/')) {
        const controller = new AbortController()
        request.once('aborted', () => controller.abort())
        const web = new Request(target, { method: request.method, headers: request.headers, signal: controller.signal,
          ...(!['GET', 'HEAD'].includes(request.method) ? { body: Readable.toWeb(request), duplex: 'half' } : {}) })
        const result = await handle(web)
        response.writeHead(result.status, Object.fromEntries(result.headers))
        response.end(Buffer.from(await result.arrayBuffer()))
        return
      }
      if (request.headers.host !== new URL(origin).host || request.headers['sec-fetch-site'] === 'cross-site') throw new WorkbenchError('AGENT_HOST_FORBIDDEN', 403)
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new WorkbenchError('AGENT_ROUTE_NOT_FOUND', 404)
      const pathname = decodeURIComponent(target.pathname)
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) throw new WorkbenchError('AGENT_ROUTE_NOT_FOUND', 404)
      const relative = pathname.replace(/^\/agent(?=\/|$)/, '').replace(/^\//, '')
      const asset = relative.startsWith('assets/') || relative === 'favicon.svg'
      if (relative !== 'agent.html' && !asset && path.extname(relative)) throw new WorkbenchError('AGENT_ROUTE_NOT_FOUND', 404)
      let file = path.join(staticRoot, asset ? relative : 'agent.html')
      try {
        const root = await realpath(staticRoot)
        file = await realpath(file)
        if (!file.startsWith(`${root}${path.sep}`)) throw new WorkbenchError('AGENT_ROUTE_NOT_FOUND', 404)
      } catch (error) {
        if (error instanceof WorkbenchError) throw error
        throw new WorkbenchError('AGENT_UI_NOT_BUILT', 503)
      }
      const bytes = await readFile(file)
      const contentType = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' }[path.extname(file)] ?? 'application/octet-stream'
      response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      const known = error instanceof WorkbenchError
      response.writeHead(known ? error.status : 500, { 'content-type': 'application/problem+json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      response.end(JSON.stringify({ type: 'about:blank', title: known ? error.code : 'AGENT_HTTP_FAILED', status: known ? error.status : 500, code: known ? error.code : 'AGENT_HTTP_FAILED' }))
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  handle = createAgentWorkbenchHandler({ workbench, origin })
  onListening?.({ pid: process.pid, origin })
  return { origin, server, async close() { server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); await workbench.close?.() } }
}
