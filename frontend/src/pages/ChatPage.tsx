import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useChat } from '@/contexts/SocketContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { getInitials, formatRelativeTime } from '@/lib/utils'
import {
  MessageSquare,
  Search,
  Plus,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  MoreVertical,
  Users,
  Check,
  CheckCheck,
  ArrowLeft,
} from 'lucide-react'
import { api } from '@/services/api'

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const [search, setSearch] = useState('')

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.chat.getConversations(),
  })

  if (isLoading) {
    return <PageLoading />
  }

  // Transformer les données du backend au format attendu par le composant
  const conversationList = (conversations || []).map((c: any) => ({
    id: String(c.id),
    type: c.scope === 'direct' ? 'direct' : 'group',
    name: c.title || c.participants?.map((p: any) => p.display_name).join(', ') || 'Conversation',
    avatar: c.participants?.[0]?.avatar_url || null,
    lastMessage: c.last_message || 'Pas de message',
    lastMessageTime: c.last_message_at ? new Date(c.last_message_at) : new Date(c.created_at),
    unreadCount: c.unread_count || 0,
    online: false,
    participants: c.participant_count || c.participants?.length || 0,
  }))

  const filteredConversations = conversationList.filter((c: any) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-8rem)] flex">
      {/* Conversations List */}
      <div
        className={`w-full md:w-80 border-r flex flex-col ${
          conversationId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">Messages</h1>
            <Button size="icon" variant="ghost">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation: any) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === conversationId}
            />
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${!conversationId ? 'hidden md:flex' : 'flex'}`}>
        {conversationId ? (
          <ChatArea
            conversationId={conversationId}
            conversation={conversationList.find((c: any) => c.id === conversationId)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Bienvenue dans vos messages</h2>
              <p className="text-muted-foreground mb-4">
                Sélectionnez une conversation ou démarrez une nouvelle discussion
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle conversation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationItem({
  conversation,
  active,
}: {
  conversation: any
  active: boolean
}) {
  return (
    <Link
      to={`/chat/${conversation.id}`}
      className={`flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors border-b ${
        active ? 'bg-muted' : ''
      }`}
    >
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={conversation.avatar} />
          <AvatarFallback>
            {conversation.type === 'group' ? (
              <Users className="h-5 w-5" />
            ) : (
              getInitials(conversation.name || '')
            )}
          </AvatarFallback>
        </Avatar>
        {conversation.online && (
          <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium truncate">{conversation.name}</p>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(conversation.lastMessageTime)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground truncate">
            {conversation.lastMessage}
          </p>
          {conversation.unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] flex items-center justify-center">
              {conversation.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

function ChatArea({
  conversationId,
  conversation,
}: {
  conversationId: string
  conversation: any
}) {
  const { user } = useAuth()
  const { messages: socketMessages, sendMessage: socketSend, typing } = useChat(Number(conversationId))
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Charger les messages depuis l'API
  const { data: apiMessages = [], refetch } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.chat.getMessages(Number(conversationId)),
    enabled: !!conversationId,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [apiMessages, socketMessages])

  const handleSend = async () => {
    if (!newMessage.trim()) return
    try {
      await api.chat.sendMessage(Number(conversationId), newMessage)
      socketSend(newMessage)
      setNewMessage('')
      refetch()
    } catch (error) {
      console.error('Erreur envoi message:', error)
    }
  }

  // Combiner les messages API avec les messages socket en temps réel
  const allMessages = [...apiMessages, ...socketMessages].map((msg: any) => ({
    id: String(msg.id || msg.messageId || Date.now()),
    senderId: msg.sender_id || msg.senderId,
    senderName: msg.sender_name || msg.senderName || 'Utilisateur',
    content: msg.body || msg.content,
    timestamp: new Date(msg.created_at || msg.timestamp || Date.now()),
    read: true,
  }))

  return (
    <>
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Link to="/chat" className="md:hidden">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Avatar className="h-10 w-10">
            <AvatarImage src={conversation?.avatar} />
            <AvatarFallback>
              {conversation?.type === 'group' ? (
                <Users className="h-4 w-4" />
              ) : (
                getInitials(conversation?.name || '')
              )}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{conversation?.name}</p>
            <p className="text-xs text-muted-foreground">
              {conversation?.online ? 'En ligne' : 'Hors ligne'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Aucun message. Commencez la conversation !
          </div>
        ) : (
          allMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === user?.id}
            />
          ))
        )}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-100" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-200" />
            </div>
            <span>{conversation?.name} est en train d'écrire...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder="Écrire un message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1"
          />
          <Button variant="ghost" size="icon">
            <Smile className="h-5 w-5" />
          </Button>
          <Button onClick={handleSend} disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  )
}

function MessageBubble({ message, isOwn }: { message: any; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        }`}
      >
        <p className="text-sm">{message.content}</p>
        <div
          className={`flex items-center gap-1 mt-1 text-[10px] ${
            isOwn ? 'text-primary-foreground/70 justify-end' : 'text-muted-foreground'
          }`}
        >
          <span>{formatRelativeTime(message.timestamp)}</span>
          {isOwn && (
            message.read ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )
          )}
        </div>
      </div>
    </div>
  )
}
