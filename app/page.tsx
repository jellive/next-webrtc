import VideoChat from './components/VideoChat'

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">WebRTC 화상 채팅</h1>
      <VideoChat />
    </div>
  )
}
