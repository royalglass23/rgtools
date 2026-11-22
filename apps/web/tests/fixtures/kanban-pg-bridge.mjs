// Fixed loopback-only Neon protocol adapter for the fictional acceptance database.
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const { WebSocketServer, createWebSocketStream } = createRequire(path.join(root, 'packages/db/package.json'))('ws')
const server = http.createServer()
const wss = new WebSocketServer({ server })
wss.on('connection', ws => {
  // Request URL/query can never select a remote PG host or port.
  const socket = net.connect(55442, '127.0.0.1'), stream = createWebSocketStream(ws)
  socket.on('error', () => stream.destroy()); stream.on('error', () => socket.destroy())
  socket.pipe(stream).pipe(socket)
})
server.listen(55443, '127.0.0.1', () => console.log('Fictional loopback bridge55443 → PostgreSQL55442'))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(() => process.exit(0)) })
