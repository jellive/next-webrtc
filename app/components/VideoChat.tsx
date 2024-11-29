'use client'

import { useEffect, useRef, memo } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'

const RemoteVideo = memo(({ stream, peerId }: { stream: MediaStream; peerId: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="relative aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover rounded-lg bg-gray-800"
      />
      <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 rounded text-sm">
        참가자 {peerId.slice(0, 4)}
      </div>
    </div>
  )
})

RemoteVideo.displayName = 'RemoteVideo'

export default function VideoChat() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const { localStream, remoteStreams, startStream, isConnected } =
    useWebRTC('test-room')

  useEffect(() => {
    if (isConnected) {
      startStream()
    }
  }, [isConnected, startStream])

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen bg-gray-900">
      <div className="text-sm text-white">
        연결 상태: {isConnected ? '연결됨' : '연결 중...'}
      </div>
      <div className="grid grid-cols-3 gap-4 auto-rows-fr">
        {/* 로컬 비디오 */}
        <div className="relative aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover rounded-lg bg-gray-800"
          />
          <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 rounded text-sm">
            나
          </div>
        </div>

        {/* 리모트 비디오 */}
        {Array.from(remoteStreams).map(([peerId, stream]) => (
          <RemoteVideo key={peerId} stream={stream} peerId={peerId} />
        ))}

        {/* 빈 슬롯 */}
        {[...Array(4 - remoteStreams.size)].map((_, i) => (
          <div key={`empty-${i}`} className="relative aspect-video">
            <div className="absolute inset-0 rounded-lg bg-gray-800 flex items-center justify-center">
              <div className="text-gray-500 text-sm">대기 중...</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
