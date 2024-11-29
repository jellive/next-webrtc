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
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef<MediaStream | null>(null)

  const startMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      console.log('Media devices not available:', err)
      return null
    }
  }, [])

  const createPeerConnection = useCallback(
    (peerId: string) => {
      console.log('Creating peer connection for:', peerId)
      const pc = new RTCPeerConnection({
        iceServers: [],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      })

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (localStreamRef.current) {
            console.log('Adding track to peer connection:', track.kind)
            pc.addTrack(track, localStreamRef.current)
          }
        })
      }

      pc.ontrack = event => {
        console.log('Received remote track from:', peerId, event.streams[0]?.id)
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0]

          setRemoteStreams(prev => {
            const newStreams = new Map(prev)
            newStreams.set(peerId, stream)
            return newStreams
          })

          event.track.onended = () => {
            console.log('Track ended:', event.track.kind)
            setRemoteStreams(prev => {
              const newStreams = new Map(prev)
              const peerStream = newStreams.get(peerId)
              if (peerStream && peerStream.getTracks().length === 0) {
                newStreams.delete(peerId)
              }
              return newStreams
            })
          }

          console.log(
            'Stream tracks:',
            stream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState
            }))
          )
        }
      }

      pc.onicecandidate = event => {
        if (event.candidate) {
          console.log('Sending ICE candidate to:', peerId)
          socketRef.current?.emit(
            'ice-candidate',
            event.candidate,
            roomId,
            peerId
          )
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log(
          'ICE connection state with',
          peerId,
          ':',
          pc.iceConnectionState
        )
      }

      pc.onconnectionstatechange = () => {
        console.log('Connection state with', peerId, ':', pc.connectionState)
      }

      return pc
    },
    [roomId]
  )

  const handleNegotiation = useCallback(
    async (pc: RTCPeerConnection, peerId: string) => {
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
    },
    [roomId]
  )

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(!isVideoOff)
    }
  }, [isVideoOff])

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })

      screenStreamRef.current = screenStream
      setIsScreenSharing(true)

      peerConnections.current.forEach((pc, peerId) => {
        screenStream.getTracks().forEach(track => {
          pc.addTrack(track, screenStream)
        })
      })

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare()
      }
    } catch (err) {
      console.error('Error starting screen share:', err)
    }
  }, [])

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => {
        track.stop()
        peerConnections.current.forEach(pc => {
          pc.getSenders()
            .filter(sender => sender.track === track)
            .forEach(sender => pc.removeTrack(sender))
        })
      })
      screenStreamRef.current = null
      setIsScreenSharing(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      console.log('Initializing connection...')

      socketRef.current = io({
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 5
      })

      socketRef.current.on('connect', async () => {
        console.log('Socket connected')
        setIsConnected(true)

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          })
          if (mounted) {
            localStreamRef.current = stream
            setLocalStream(stream)
          }
        } catch (err) {
          console.log('Media devices not available:', err)
        }

        socketRef.current?.emit('join-room', roomId)
      })

      socketRef.current.on('room-joined', async ({ peers = [] }) => {
        console.log('Room joined with peers:', peers)

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
          console.log('Remote description set for offer')

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          console.log('Local description set for answer')

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
            console.log('Remote description set for answer')
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
            console.log('Added ICE candidate')
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
    isConnected,
    isMuted,
    isVideoOff,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    startMediaStream
  }
}
