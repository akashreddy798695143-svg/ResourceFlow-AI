import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ChatPage() {
  try {
    const user = await requireAuth()
    // User is authenticated, render the chat page
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-8">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div>
              <h1 className="text-2xl font-bold">Communication Center</h1>
              <p className="text-sm text-muted-foreground">Secure in-app messaging for all authorized users</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <ChatCenterClient userId={user.id} />
          </div>
        </div>
      </div>
    )
  } catch {
    redirect('/login')
  }
}

// Client component for the chat functionality
import dynamic from 'next/dynamic'

const ChatCenterClient = dynamic(
  () => import('@/components/features/chat-center').then((mod) => mod.ChatCenter),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    ),
  }
)