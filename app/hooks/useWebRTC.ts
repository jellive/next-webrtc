'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

export const useWebRTC = (roomId: string) => {
  const [isConnected, setIsConnected] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  )
  const socketRef = useRef<Socket>()
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  const startMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      console.error('Error accessing media devices:', err)
    }
  }

  const createPeerConnection = useCallback((peerId: string) => {
    console.log('Creating peer connection for:', peerId)
    const pc = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })

    if (localStreamRef.current) {
      console.log('Adding local tracks to peer connection:', peerId)
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current)
        }
      })
    }

    pc.ontrack = (event) => {
      console.log('Received remote track from:', peerId, event.streams[0]?.id)
      const [remoteStream] = event.streams
      if (remoteStream) {
        console.log('Setting remote stream for:', peerId)
        requestAnimationFrame(() => {
          setRemoteStreams(prev => {
            const newStreams = new Map(prev)
            newStreams.set(peerId, remoteStream)
            return newStreams
          })
        })
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', peerId, event.candidate.type)
        socketRef.current?.emit('ice-candidate', event.candidate, roomId, peerId)
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state with', peerId, ':', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        console.log('Attempting to restart ICE for:', peerId)
        pc.restartIce()
      }
    }

    return pc
  }, [roomId])

  const handleNegotiation = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    try {
      console.log('Creating offer for:', peerId)
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true
      })
      
      console.log('Setting local description for:', peerId)
      await pc.setLocalDescription(offer)
      
      console.log('Sending offer to:', peerId)
      socketRef.current?.emit('offer', offer, roomId, peerId)
    } catch (err) {
      console.error('Error during negotiation:', err)
    }
  }, [roomId])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      console.log('Initializing connection...')
      const stream = await startMediaStream()
      if (!stream || !mounted) return

      socketRef.current = io({
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 5
      })
      
      socketRef.current.on('connect', () => {
        console.log('Socket connected')
        setIsConnected(true)
        socketRef.current?.emit('join-room', roomId)
      })

      socketRef.current.on('room-joined', async ({ peers = [] }) => {
        console.log('Room joined with peers:', peers)
        
        // 기존 피어들과 연결 시도
        for (const peerId of peers) {
          if (!peerConnections.current.has(peerId)) {
            console.log('Creating connection with existing peer:', peerId)
            const pc = createPeerConnection(peerId)
            peerConnections.current.set(peerId, pc)
            await handleNegotiation(pc, peerId)
          }
        }
      })

      socketRef.current.on('peer-joined', async ({ peerId }) => {
        console.log('New peer joined:', peerId)
        if (!peerConnections.current.has(peerId)) {
          const pc = createPeerConnection(peerId)
          peerConnections.current.set(peerId, pc)
        }
      })

      socketRef.current.on('offer', async (offer, fromPeerId) => {
        console.log('Received offer from:', fromPeerId)
        let pc = peerConnections.current.get(fromPeerId)

        if (!pc) {
          pc = createPeerConnection(fromPeerId)
          peerConnections.current.set(fromPeerId, pc)
        }

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socketRef.current?.emit('answer', answer, roomId, fromPeerId)
        } catch (err) {
          console.error('Error handling offer:', err)
        }
      })

      socketRef.current.on('answer', async (answer, fromPeerId) => {
        console.log('Received answer from:', fromPeerId)
        const pc = peerConnections.current.get(fromPeerId)
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
          } catch (err) {
            console.error('Error handling answer:', err)
          }
        }
      })

      socketRef.current.on('ice-candidate', async (candidate, fromPeerId) => {
        console.log('Received ICE candidate from:', fromPeerId)
        const pc = peerConnections.current.get(fromPeerId)
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('Error adding ICE candidate:', err)
          }
        }
      })

      socketRef.current.on('peer-disconnected', peerId => {
        console.log('Peer disconnected:', peerId)
        const pc = peerConnections.current.get(peerId)
        if (pc) {
          pc.close()
          peerConnections.current.delete(peerId)
        }
        setRemoteStreams(prev => {
          const newStreams = new Map(prev)
          newStreams.delete(peerId)
          return newStreams
        })
      })
    }

    init()

    return () => {
      mounted = false
      localStreamRef.current?.getTracks().forEach(track => {
        track.stop()
        console.log('Stopped track:', track.kind)
      })
      peerConnections.current.forEach(pc => {
        pc.close()
        console.log('Closed peer connection')
      })
      peerConnections.current.clear()
      setRemoteStreams(new Map())
      socketRef.current?.disconnect()
    }
  }, [roomId, createPeerConnection, handleNegotiation])

  return {
    localStream,
    remoteStreams,
    startStream: startMediaStream,
    isConnected
  }
}
