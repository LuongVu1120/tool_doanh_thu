import { loadRootEnv, readPort } from '@huyk/shared'

loadRootEnv()

const pollIntervalMs = readPort(process.env.WORKER_POLL_INTERVAL_MS, 30_000)

console.log(`huyk-worker started with ${pollIntervalMs}ms poll interval`)

const timer = setInterval(() => {
  console.log(`huyk-worker heartbeat ${new Date().toISOString()}`)
}, pollIntervalMs)

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function shutdown(): void {
  clearInterval(timer)
  console.log('huyk-worker stopped')
  process.exit(0)
}
