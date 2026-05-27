import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

import { loadRootEnv, readPort } from '@huyk/shared'

loadRootEnv()

const port = readPort(process.env.API_PORT ?? process.env.PORT, 4000)
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000'

const server = createServer((request, response) => {
  const requestId = request.headers['x-request-id']?.toString() ?? randomUUID()

  withCors(response)
  response.setHeader('x-request-id', requestId)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && isHealthRoute(request.url)) {
    sendJson(response, 200, {
      ok: true,
      service: 'huyk-api',
      requestId,
      time: new Date().toISOString(),
    })
    return
  }

  sendJson(response, 404, {
    ok: false,
    error: 'Not found',
    requestId,
  })
})

server.listen(port, () => {
  console.log(`huyk-api listening on http://localhost:${port}`)
})

function isHealthRoute(url: IncomingMessage['url']): boolean {
  return url === '/health' || url === '/v1/health'
}

function withCors(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', corsOrigin)
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type,authorization,x-request-id')
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}
