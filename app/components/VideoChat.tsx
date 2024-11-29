'use client'

import { useEffect, useRef, memo, useState } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'

const RemoteVideo = memo(({ stream, peerId }: { stream: MediaStream; peerId: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playAttemptRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    console.log('Setting up remote video for peer:', peerId)
    const videoElement = videoRef.current
    if (!videoElement || !stream) return

    const cleanup = () => {
      if (playAttemptRef.current) {
        clearTimeout(playAttemptRef.current)
      }
      if (videoElement.srcObject) {
        videoElement.srcObject = null
      }
      setIsPlaying(false)
    }

    const playVideo = async (attempt = 0) => {
      if (!mountedRef.current || !videoElement) return
      
      try {
        // 항상 음소거 상태 유지 (자동 재생 정책 우회)
        videoElement.muted = true
        await videoElement.play()
        setIsPlaying(true)
        console.log('Remote video playing for peer:', peerId)
      } catch (err) {
        console.error('Error playing remote video:', err)
        if (!mountedRef.current) return

        if (attempt < 3) {
          playAttemptRef.current = setTimeout(() => {
            playVideo(attempt + 1)
          }, 1000)
        }
      }
    }

    // 스트림 설정
    cleanup()
    videoElement.srcObject = stream
    playVideo()

    return cleanup
  }, [stream, peerId])

  return (
    <div className="relative aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted // 항상 음소거 상태 유지
        className={`absolute inset-0 w-full h-full object-cover rounded-lg bg-gray-800 ${
          isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 rounded text-sm">
        참가자 {peerId.slice(0, 4)}
      </div>
      <div className="absolute top-2 right-2 text-xs text-white bg-black/50 px-1 py-0.5 rounded">
        {stream?.getTracks().map(track => track.kind).join(', ')}
      </div>
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-white">로딩 중...</div>
        </div>
      )}
    </div>
  )
})

RemoteVideo.displayName = 'RemoteVideo'

export default function VideoChat() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const {
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
  } = useWebRTC('test-room')

  useEffect(() => {
    if (isConnected) {
      startMediaStream()
    }
  }, [isConnected, startMediaStream])

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen bg-gray-900">
      <div className="flex justify-between items-center">
        <div className="text-sm text-white">
          연결 상태: {isConnected ? '연결됨' : '연결 중...'}
        </div>
        {localStream && (
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`px-4 py-2 rounded-lg ${
                isMuted ? 'bg-red-500' : 'bg-blue-500'
              } text-white`}
            >
              {isMuted ? '음소거 해제' : '음소거'}
            </button>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-lg ${
                isVideoOff ? 'bg-red-500' : 'bg-blue-500'
              } text-white`}
            >
              {isVideoOff ? '비디오 켜기' : '비디오 끄기'}
            </button>
            <button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`px-4 py-2 rounded-lg ${
                isScreenSharing ? 'bg-red-500' : 'bg-blue-500'
              } text-white`}
            >
              {isScreenSharing ? '화면 공유 중지' : '화면 공유'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 auto-rows-fr">
        {localStream && (
          <div className="relative aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover rounded-lg bg-gray-800"
            />
            <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 rounded text-sm">
              나 {isMuted && '(음소거)'} {isVideoOff && '(비디오 꺼짐)'}
            </div>
          </div>
        )}

        {Array.from(remoteStreams).map(([peerId, stream]) => (
          <RemoteVideo key={peerId} stream={stream} peerId={peerId} />
        ))}

        {[...Array(localStream ? 4 - remoteStreams.size : 5 - remoteStreams.size)].map((_, i) => (
          <div key={`empty-${i}`} className="relative aspect-video">
            <div className="absolute inset-0 rounded-lg bg-gray-800 flex items-center justify-center">
              <div className="text-gray-500 text-sm">대기 중...</div>
            </div>
          </div>
        ))}
      </div>

      {localStream && (
        <div className="fixed bottom-4 right-4 flex gap-2">
          {isMuted && (
            <div className="bg-red-500 text-white px-2 py-1 rounded">
              음소거됨
            </div>
          )}
          {isVideoOff && (
            <div className="bg-red-500 text-white px-2 py-1 rounded">
              비디오 꺼짐
            </div>
          )}
          {isScreenSharing && (
            <div className="bg-green-500 text-white px-2 py-1 rounded">
              화면 공유 중
            </div>
          )}
        </div>
      )}
    </div>
  )
}
