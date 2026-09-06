import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useChat } from '@/contexts/SocketContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { EmojiPicker } from '@/components/EmojiPicker'
import { fileService } from '@/services/file.service'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { QueryError } from '@/components/ui/query-error'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { getInitials, formatRelativeTime, formatFileSize } from '@/lib/utils'
import { useStreamUrl } from '@/hooks/useStreamUrl'
import {
  MessageSquare,
  Search,
  Plus,
  Send,
  Paperclip,
  Smile,
  Users,
  Check,
  CheckCheck,
  ArrowLeft,
  Reply,
  X,
  Trash2,
  Loader2,
  MessageCircle,
  FileText,
  Download,
  Music,
  Video,
  Archive,
} from 'lucide-react'
import { api } from '@/services/api'

// Shared by the conversation list (GET /chat/conversations) and ChatArea's own
// detail fetch (GET /chat/conversations/:id) -- both endpoints return the same
// conversation shape (scope/title/participants), just reached via different ids.
function deriveConversationView(c: any, currentUserId: number | undefined, t: (key: string, opts?: any) => string) {
  const otherParticipants = (c.participants || []).filter((p: any) => p.user_id !== currentUserId)
  return {
    id: String(c.public_id ?? c.id),
    numericId: c.id,
    type: c.scope === 'direct' ? 'direct' : 'group',
    name: c.title || c.participants?.map((p: any) => p.display_name).join(', ') || t('defaultConversationName'),
    avatar: c.participants?.[0]?.avatar_url || null,
    lastMessage: c.last_message || t('noMessage'),
    lastMessageTime: c.last_message_at ? new Date(c.last_message_at) : new Date(c.created_at),
    unreadCount: c.unread_count || 0,
    participantCount: c.participant_count || c.participants?.length || 0,
    subtitle: c.scope === 'direct' ? otherParticipants[0]?.email : undefined,
  }
}

export default function ChatPage() {
  const { t } = useTranslation('chat')
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)

  const { data: conversations, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.chat.getConversations(),
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (error) {
    return <QueryError onRetry={() => refetch()} />
  }

  // Transformer les données du backend au format attendu par le composant
  const conversationList = (conversations || []).map((c: any) => deriveConversationView(c, user?.id, t))

  const filteredConversations = conversationList.filter((c: any) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-xl border overflow-hidden bg-card shadow-sm">
      {/* Conversations List */}
      <div
        className={`w-full md:w-80 border-r flex flex-col bg-muted/20 ${
          conversationId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b bg-card">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold tracking-tight">{t('messages')}</h1>
            <Button
              size="icon"
              className="rounded-full h-9 w-9 shadow-sm"
              aria-label={t('newConversation')}
              onClick={() => setIsNewConversationOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              className="pl-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10 px-4">
              {search ? t('noConversations') : t('noConversationsYet')}
            </div>
          ) : (
            filteredConversations.map((conversation: any) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === conversationId}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-card ${!conversationId ? 'hidden md:flex' : 'flex'}`}>
        {conversationId ? (
          <ChatArea conversationId={conversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8 bg-gradient-to-b from-transparent to-muted/20">
            <div>
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <MessageSquare className="h-9 w-9 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{t('welcomeTitle')}</h2>
              <p className="text-muted-foreground mb-5 max-w-xs mx-auto">
                {t('welcomeHint')}
              </p>
              <Button className="rounded-full shadow-sm" onClick={() => setIsNewConversationOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('newConversation')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewConversationDialog
        open={isNewConversationOpen}
        onOpenChange={setIsNewConversationOpen}
        onCreated={(newConversationPublicId) => {
          setIsNewConversationOpen(false)
          refetch()
          navigate(`/chat/${newConversationPublicId}`)
        }}
      />
    </div>
  )
}

function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (conversationPublicId: string) => void
}) {
  const { t } = useTranslation('chat')
  const [search, setSearch] = useState('')

  const { data: colleagues = [], isLoading } = useQuery({
    queryKey: ['chat-colleagues', search],
    queryFn: () => api.users.search(search),
    enabled: open,
  })

  const startMutation = useMutation({
    mutationFn: (colleagueId: number) => api.chat.createConversation('direct', [colleagueId]),
    onSuccess: (conversation) => onCreated(conversation.public_id),
  })

  // Fresh search each time the dialog opens rather than keeping a stale query.
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newConversationDialog.title')}</DialogTitle>
          <DialogDescription>{t('newConversationDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={t('newConversationDialog.searchPlaceholder')}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto -mx-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : colleagues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('newConversationDialog.noResults')}
            </p>
          ) : (
            colleagues.map((colleague: any) => (
              <button
                key={colleague.id}
                type="button"
                disabled={startMutation.isPending}
                onClick={() => startMutation.mutate(colleague.id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left disabled:opacity-50"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={colleague.avatar_url} />
                  <AvatarFallback>{getInitials(colleague.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{colleague.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{colleague.email}</p>
                </div>
                {startMutation.isPending && startMutation.variables === colleague.id && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConversationItem({
  conversation,
  active,
}: {
  conversation: any
  active: boolean
}) {
  const { t } = useTranslation('chat')
  const unread = conversation.unreadCount > 0
  return (
    <Link
      to={`/chat/${conversation.id}`}
      className={`flex items-center gap-3 mx-2 px-2.5 py-2.5 rounded-xl transition-colors ${
        active ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <Avatar className="h-12 w-12 shrink-0 ring-2 ring-card">
        <AvatarImage src={conversation.avatar} />
        <AvatarFallback className={conversation.type === 'group' ? 'bg-accent' : ''}>
          {conversation.type === 'group' ? (
            <Users className="h-5 w-5" />
          ) : (
            getInitials(conversation.name || '')
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate ${unread ? 'font-semibold' : 'font-medium'}`}>{conversation.name}</p>
          <span className={`text-xs shrink-0 ${unread ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            {formatRelativeTime(conversation.lastMessageTime)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm truncate ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
            {conversation.type === 'group' && conversation.participantCount > 0
              ? t('groupParticipantCount', { count: conversation.participantCount })
              : conversation.lastMessage}
          </p>
          {unread && (
            <Badge className="h-5 min-w-[20px] flex items-center justify-center rounded-full shrink-0">
              {conversation.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-medium text-muted-foreground px-2">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function ChatArea({
  conversationId,
}: {
  conversationId: string
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // conversationId is the opaque public_id from the URL -- this resolves it to
  // the conversation (and, via the numeric id below, doubles as the access
  // check): a conversation that doesn't exist or that the user isn't a
  // participant of 404s/403s here instead of the page silently rendering an
  // empty "no messages yet" state that looks identical to a real empty chat.
  const {
    data: conversationDetail,
    isLoading: isLoadingConversation,
    error: conversationError,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.chat.getConversation(conversationId),
    enabled: !!conversationId,
    retry: false,
  })

  const conversation = conversationDetail ? deriveConversationView(conversationDetail, user?.id, t) : undefined
  const numericId = conversation?.numericId

  const { messages: socketMessages, sendMessage: socketSend, typing } = useChat(numericId)
  const [newMessage, setNewMessage] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [replyingTo, setReplyingTo] = useState<any | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)

  // Inserts at the cursor position (falling back to the end) rather than always
  // appending, so picking an emoji mid-sentence doesn't jump it to the end. Closes
  // the popover and refocuses the input afterward -- Radix returns focus to the
  // trigger button on close by default, which would leave the user unable to keep
  // typing without an extra click.
  const handleInsertEmoji = (emoji: string) => {
    const input = messageInputRef.current
    const start = input?.selectionStart ?? newMessage.length
    const end = input?.selectionEnd ?? newMessage.length
    const next = newMessage.slice(0, start) + emoji + newMessage.slice(end)
    setNewMessage(next)
    setEmojiPickerOpen(false)
    // Radix's own close-animation-then-refocus-trigger sequence can finish after
    // a requestAnimationFrame callback would, silently stealing focus back from
    // the input despite onCloseAutoFocus's preventDefault -- a short timeout
    // outlasts that animation (see PopoverContent's animate-out classes).
    setTimeout(() => {
      input?.focus()
      const cursor = start + emoji.length
      input?.setSelectionRange(cursor, cursor)
    }, 150)
  }

  // Charger les messages depuis l'API
  const { data: apiMessages = [], refetch } = useQuery({
    queryKey: ['messages', numericId],
    queryFn: () => api.chat.getMessages(numericId!),
    enabled: !!numericId,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [apiMessages, socketMessages])

  const handleSend = async () => {
    if (!newMessage.trim() || !numericId) return
    try {
      await api.chat.sendMessage(numericId, newMessage, undefined, replyingTo?.id)
      socketSend(newMessage)
      setNewMessage('')
      setReplyingTo(null)
      refetch()
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('sendErrorDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    if (!messageToDelete) return
    try {
      await api.chat.deleteMessage(Number(messageToDelete))
      if (replyingTo && String(replyingTo.id) === messageToDelete) {
        setReplyingTo(null)
      }
      refetch()
    } catch (error) {
      console.error('Erreur suppression message:', error)
    } finally {
      setMessageToDelete(null)
    }
  }

  const [isAttaching, setIsAttaching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAttachmentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !numericId) return

    setIsAttaching(true)
    try {
      const uploaded = await fileService.uploadFile(file, undefined, 'chat-attachments')
      await api.chat.sendMessage(numericId, newMessage.trim(), [uploaded.id], replyingTo?.id)
      setNewMessage('')
      setReplyingTo(null)
      refetch()
    } catch (error: any) {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('attachErrorDescription'),
        variant: 'destructive',
      })
    } finally {
      setIsAttaching(false)
    }
  }

  // Combiner les messages API avec les messages socket en temps réel
  const allMessages = [...apiMessages, ...socketMessages].map((msg: any) => ({
    id: String(msg.id || msg.messageId || Date.now()),
    senderId: msg.sender_id || msg.senderId,
    senderName: msg.sender_name || msg.senderName || t('defaultUser'),
    content: msg.body || msg.content,
    timestamp: new Date(msg.created_at || msg.timestamp || Date.now()),
    read: true,
    replyTo: msg.replyTo || null,
    attachments: msg.attachments || [],
  }))

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`chat-message-${messageId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)
    setTimeout(() => setHighlightedMessageId((current) => (current === messageId ? null : current)), 1500)
  }

  const dayLabel = (date: Date): string => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    if (sameDay(date, today)) return t('today')
    if (sameDay(date, yesterday)) return t('yesterday')
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  }

  if (isLoadingConversation) {
    return <PageLoading />
  }

  if (conversationError || !conversation) {
    return (
      <QueryError
        message={t('conversationNotFound')}
        action={
          <Button size="sm" onClick={() => navigate('/chat')}>
            {t('backToMessages')}
          </Button>
        }
      />
    )
  }

  return (
    <>
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Link to="/chat" className="md:hidden">
            <Button variant="ghost" size="icon" aria-label={tCommon('actions.back')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Avatar className="h-10 w-10">
            <AvatarImage src={conversation?.avatar} />
            <AvatarFallback className={conversation?.type === 'group' ? 'bg-accent' : ''}>
              {conversation?.type === 'group' ? (
                <Users className="h-4 w-4" />
              ) : (
                getInitials(conversation?.name || '')
              )}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{conversation?.name}</p>
            <p className="text-xs text-muted-foreground">
              {conversation?.type === 'group'
                ? t('groupParticipantCount', { count: conversation?.participantCount || 0 })
                : conversation?.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/10">
        {allMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-8">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p>{t('noMessages')}</p>
          </div>
        ) : (
          allMessages.map((message, index) => {
            const previous = allMessages[index - 1]
            const showDivider = !previous || dayLabel(previous.timestamp) !== dayLabel(message.timestamp)
            return (
              <div key={message.id}>
                {showDivider && <DayDivider label={dayLabel(message.timestamp)} />}
                <MessageBubble
                  message={message}
                  isOwn={message.senderId === user?.id}
                  highlighted={highlightedMessageId === message.id}
                  onReply={() => setReplyingTo(message)}
                  onDelete={message.senderId === user?.id ? () => setMessageToDelete(message.id) : undefined}
                  onReplyPreviewClick={message.replyTo ? () => scrollToMessage(String(message.replyTo.id)) : undefined}
                />
              </div>
            )
          })
        )}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1 bg-muted rounded-full px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce delay-100" />
              <div className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce delay-200" />
            </div>
            <span>{t('isTyping', { name: conversation?.name })}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-card">
        {replyingTo && (
          <div className="flex items-start justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-muted border-l-2 border-primary">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {t('replyingTo', { name: replyingTo.senderName })}
              </p>
              <p className="text-sm text-muted-foreground truncate">{replyingTo.content}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={t('cancelReply')}
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleAttachmentSelected}
          />
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full shrink-0"
            aria-label={t('attachFile')}
            disabled={isAttaching}
            onClick={() => fileInputRef.current?.click()}
          >
            {isAttaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>
          <Input
            ref={messageInputRef}
            placeholder={t('messagePlaceholder')}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 rounded-full bg-muted/50 border-transparent focus-visible:bg-card"
          />
          <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="rounded-full shrink-0" aria-label={t('insertEmoji')}>
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto"
              // Radix returns focus to the trigger button on close by default,
              // which would fight the explicit input refocus in handleInsertEmoji.
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <EmojiPicker onSelect={handleInsertEmoji} />
            </PopoverContent>
          </Popover>
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            size="icon"
            className="rounded-full shrink-0 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title={t('deleteMessageTitle')}
        description={t('deleteMessageDescription')}
        onConfirm={handleDelete}
      />
    </>
  )
}

function MessageBubble({
  message,
  isOwn,
  highlighted,
  onReply,
  onDelete,
  onReplyPreviewClick,
}: {
  message: any
  isOwn: boolean
  highlighted?: boolean
  onReply?: () => void
  onDelete?: () => void
  onReplyPreviewClick?: () => void
}) {
  const { t } = useTranslation('chat')
  return (
    <div
      id={`chat-message-${message.id}`}
      className={`group flex items-end gap-2 transition-colors rounded-lg ${isOwn ? 'justify-end' : 'justify-start'} ${
        highlighted ? 'bg-primary/10' : ''
      }`}
    >
      {!isOwn && (
        <Avatar className="h-7 w-7 shrink-0 mb-0.5">
          <AvatarFallback className="text-[10px]">{getInitials(message.senderName)}</AvatarFallback>
        </Avatar>
      )}

      {isOwn && (onReply || onDelete) && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={t('deleteMessage')}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onReply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={t('reply')}
              onClick={onReply}
            >
              <Reply className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        }`}
      >
        {!isOwn && (
          <p className="text-xs font-medium text-primary mb-0.5">{message.senderName}</p>
        )}
        {message.replyTo && (
          <button
            type="button"
            onClick={onReplyPreviewClick}
            className={`block w-full text-left mb-1 pl-2 border-l-2 rounded-sm ${
              isOwn ? 'border-primary-foreground/40' : 'border-primary/50'
            }`}
          >
            <p className={`text-xs font-medium ${isOwn ? 'text-primary-foreground/80' : 'text-primary'}`}>
              {message.replyTo.senderName}
            </p>
            <p className={`text-xs truncate ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {message.replyTo.deleted ? t('originalMessageDeleted') : message.replyTo.body}
            </p>
          </button>
        )}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {message.attachments.length > 0 && (
          <div className={`flex flex-col gap-1.5 ${message.content ? 'mt-2' : ''}`}>
            {message.attachments.map((attachment: any) => (
              <AttachmentItem key={attachment.id} attachment={attachment} isOwn={isOwn} />
            ))}
          </div>
        )}
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
      {!isOwn && onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={t('reply')}
          onClick={onReply}
        >
          <Reply className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function attachmentIcon(mimeType: string) {
  if (mimeType?.startsWith('video/')) return Video
  if (mimeType?.startsWith('audio/')) return Music
  if (mimeType === 'application/zip') return Archive
  return FileText
}

// GET /files/:id/stream sets Content-Disposition: inline for images/video/audio/pdf
// and attachment (forced download, real filename) for everything else -- so the
// same minted stream URL works whether this renders an inline thumbnail or a
// click-to-download file card.
function AttachmentItem({ attachment, isOwn }: { attachment: any; isOwn: boolean }) {
  const streamUrl = useStreamUrl(attachment.id)
  const isImage = attachment.mime_type?.startsWith('image/')

  if (isImage) {
    return (
      <a href={streamUrl} target="_blank" rel="noreferrer" className="block">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt={attachment.filename}
            className="max-w-full max-h-64 rounded-lg object-cover"
          />
        ) : (
          <div className="h-32 w-full max-w-[200px] rounded-lg bg-black/10 animate-pulse" />
        )}
      </a>
    )
  }

  const Icon = attachmentIcon(attachment.mime_type)
  return (
    <a
      href={streamUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
        isOwn ? 'bg-primary-foreground/10 hover:bg-primary-foreground/15' : 'bg-background hover:bg-background/70'
      }`}
    >
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${isOwn ? 'bg-primary-foreground/15' : 'bg-muted'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{attachment.filename}</p>
        {attachment.size_bytes != null && (
          <p className={`text-[10px] ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            {formatFileSize(attachment.size_bytes)}
          </p>
        )}
      </div>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
  )
}
