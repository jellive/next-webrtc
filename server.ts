import { createServer as createHttpsServer } from 'https'
import { createServer as createHttpServer } from 'http'
import { Server } from 'socket.io'
import next from 'next'
import { parse } from 'url'
import fs from 'fs'
import path from 'path'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = 3001

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// HTTPS 인증서 설정
const httpsOptions = {
  key: fs.readFileSync(
    path.join(process.cwd(), 'certificates', 'localhost-key.pem')
  ),
  cert: fs.readFileSync(
    path.join(process.cwd(), 'certificates', 'localhost.pem')
  )
}

// 타입 정의 추가
interface Room {
  initiator: string
  peers: Set<string>
}

app.prepare().then(() => {
  // HTTP 서버 (HTTPS로 리다이렉트)
  const httpServer = createHttpServer((req, res) => {
    const httpsUrl = `https://${req.headers.host}${req.url}`
    res.writeHead(301, { Location: httpsUrl })
    res.end()
  })

  // HTTPS 서버
  const httpsServer = createHttpsServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  const io = new Server(httpsServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  // 룸 상태 관리
  const rooms = new Map<string, Room>()

  io.on('connection', socket => {
    console.log('사용자 연결됨:', socket.id)

    // 현재 룸 상태 출력 함수
    const logRoomState = (roomId: string) => {
      const room = rooms.get(roomId)
      console.log(`Room ${roomId} state:`, {
        initiator: room?.initiator,
        peers: Array.from(room?.peers || []),
        socketRooms: Array.from(socket.rooms || []),
        ioRooms: Array.from(io.sockets.adapter.rooms.keys() || [])
      })
    }

    socket.on('join-room', roomId => {
      console.log(`[${socket.id}] Attempting to join room:`, roomId)

      let room = rooms.get(roomId)

      if (!room) {
        room = {
          initiator: socket.id,
          peers: new Set([socket.id])
        }
        rooms.set(roomId, room)
        socket.join(roomId)
        console.log(`[${socket.id}] Created new room as initiator`)
        socket.emit('room-joined', {
          isInitiator: true,
          peers: []
        })
      } else {
        room.peers.add(socket.id)
        socket.join(roomId)
        console.log(`[${socket.id}] Joined existing room as peer`)

        // 새로운 피어에게 기존 피어 목록 전송
        const existingPeers = Array.from(room.peers).filter(id => id !== socket.id)
        socket.emit('room-joined', {
          isInitiator: false,
          peers: existingPeers
        })

        // 기존 피어들에게 새로운 피어 알림
        existingPeers.forEach(peerId => {
          io.to(peerId).emit('peer-joined', {
            peerId: socket.id
          })
        })
      }

      logRoomState(roomId)
    })

    socket.on('offer', (offer, roomId, targetPeerId) => {
      console.log(`[${socket.id}] Sending offer to peer ${targetPeerId}`)
      io.to(targetPeerId).emit('offer', offer, socket.id)
    })

    socket.on('answer', (answer, roomId, targetPeerId) => {
      console.log(`[${socket.id}] Sending answer to peer ${targetPeerId}`)
      io.to(targetPeerId).emit('answer', answer, socket.id)
    })

    socket.on('ice-candidate', (candidate, roomId, targetPeerId) => {
      console.log(`[${socket.id}] Sending ICE candidate to peer ${targetPeerId}`)
      io.to(targetPeerId).emit('ice-candidate', candidate, socket.id)
    })

    socket.on('disconnect', () => {
      console.log(`[${socket.id}] User disconnected`)
      rooms.forEach((room, roomId) => {
        if (room.peers.has(socket.id)) {
          room.peers.delete(socket.id)
          socket.to(roomId).emit('peer-disconnected', socket.id)
          
          if (room.peers.size === 0) {
            rooms.delete(roomId)
          } else if (room.initiator === socket.id) {
            const [newInitiator] = room.peers
            room.initiator = newInitiator
          }
        }
      })
    })
  })

  // HTTP 서버는 80번 포트에서 실행
  httpServer.listen(80, hostname, () => {
    console.log(`> HTTP server ready on http://${hostname}:80`)
  })

  // HTTPS 서버는 3001번 포트에서 실행
  httpsServer.listen(port, hostname, () => {
    console.log(`> HTTPS server ready on https://${hostname}:${port}`)
    const { networkInterfaces } = require('os')
    const nets = networkInterfaces()
    console.log('\n사용 가능한 IP 주소들:')
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`- https://${net.address}:${port}`)
        }
      }
    }
  })
})
