'use client'

// Container for the emergency communication chat. Renders the conversation
// list (path /chat) or a single conversation (path /chat/[id]) based on the
// hash router params. The /chat route is registered in page.tsx for all roles.
import { useRouter } from '@/lib/use-router'
import { ChatListView } from '@/components/views/chat/chat-list'
import { ChatConversationView } from '@/components/views/chat/conversation-view'

export function ChatView() {
  const { params } = useRouter()
  if (params.id) return <ChatConversationView conversationId={params.id} />
  return <ChatListView />
}
