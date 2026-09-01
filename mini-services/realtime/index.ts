import { createServer } from 'http'
import { Server } from 'socket.io'

// RESOURCEFLOW AI — Real-time event hub
// Listens on port 3003 (forwarded by Caddy via ?XTransformPort=3003)
// The Next.js backend POSTs events here via the internal HTTP /broadcast endpoint,
// and this server fans them out to all connected dashboards.

const httpServer = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(body)
        // Fan out to every dashboard client
        io.emit('dashboard-event', event)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ service: 'resourceflow-realtime', uptime: process.uptime() }))
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[realtime] client connected: ${socket.id} (total ${io.engine.clientsCount})`)
  socket.emit('dashboard-event', {
    type: 'SYSTEM',
    label: 'Connected to RESOURCEFLOW real-time hub',
    timestamp: new Date().toISOString(),
  })
  socket.on('disconnect', () => {
    console.log(`[realtime] client disconnected: ${socket.id}`)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[realtime] RESOURCEFLOW hub listening on port ${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
