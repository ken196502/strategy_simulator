import { serve } from '@hono/node-server'
import { createServer } from 'http'
import { app } from './app'
import { setupWebSocketServer } from './websocket'

const port = Number(process.env.PORT ?? process.env.HONO_PORT ?? 2314)

// Create HTTP server
const server = createServer()

// Setup WebSocket server
setupWebSocketServer(server)

// Handle HTTP requests through Hono
server.on('request', async (req, res) => {
  try {
    // Convert Node.js request to Fetch API Request
    const url = `http://${req.headers.host}${req.url}`
    const headers = new Headers()
    
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, Array.isArray(value) ? value[0] : value)
      }
    })

    let body: ReadableStream | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = new ReadableStream({
        start(controller) {
          req.on('data', chunk => controller.enqueue(chunk))
          req.on('end', () => controller.close())
          req.on('error', err => controller.error(err))
        }
      })
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body,
      duplex: 'half'
    } as RequestInit)

    const response = await app.fetch(request)
    
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    if (response.body) {
      const reader = response.body.getReader()
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
          res.end()
        } catch (err) {
          console.error('Error reading response body:', err)
          res.end()
        }
      }
      pump()
    } else {
      res.end()
    }
  } catch (err) {
    console.error('Error handling request:', err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Hono backend listening on http://0.0.0.0:${port} with WebSocket support`)
  console.log(`📡 Accessible at http://localhost:${port} from local machine`)
  console.log(`📡 Accessible at http://192.168.99.49:${port} from network`)
  console.log(`📡 Accessible at http://172.20.10.156:${port} from network`)
})
