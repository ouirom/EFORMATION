import React, { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import {
  Bot,
  Send,
  User,
  Sparkles,
  BookOpen,
  Lightbulb,
  HelpCircle,
  Copy,
  RefreshCcw,
  Loader2,
  Languages,
} from 'lucide-react'
import { api } from '@/services/api'
import i18n from '@/i18n'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  suggestions?: string[]
}

type TutorLanguage = 'fr' | 'en'

const LANGUAGE_STORAGE_KEY = 'ai-tutor-language'

function readStoredLanguage(): TutorLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return stored === 'en' ? 'en' : 'fr'
}

// Answer language is switchable at any time (the dropdown below), independently of
// the app's own UI language -- so this page's copy is pulled from the aiTutor i18next
// namespace with a language fixed to the user's chosen answer language, via
// getFixedT, rather than the app-wide active locale from useTranslation().
function greetingMessage(language: TutorLanguage): Message {
  const t = i18n.getFixedT(language, 'aiTutor')
  return {
    id: '1',
    role: 'assistant',
    content: t('greeting'),
    timestamp: new Date(),
    suggestions: t('greetingSuggestions', { returnObjects: true }) as string[],
  }
}

export default function AITutorPage() {
  const { toast } = useToast()
  const [language, setLanguage] = useState<TutorLanguage>(readStoredLanguage)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>(() => [greetingMessage(readStoredLanguage())])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const t = i18n.getFixedT(language, 'aiTutor')

  const handleLanguageChange = (value: string) => {
    const next = value as TutorLanguage
    setLanguage(next)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    // Past messages were answered in the previous language -- starting a fresh
    // conversation in the new language avoids a confusing mixed-language thread.
    setMessages([greetingMessage(next)])
  }

  const chatMutation = useMutation({
    mutationFn: (message: string) => api.ai.askTutor(message, { language }),
    onSuccess: (response) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(false)
    },
    onError: () => {
      toast({
        title: t('errorTitle'),
        description: t('errorDescription'),
        variant: 'destructive',
      })
      setIsTyping(false)
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)
    chatMutation.mutate(input)
    setInput('')
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: t('copied') })
  }

  // Re-asks the question that led to this response, in place -- bypasses
  // chatMutation (whose onSuccess always appends a new message) since this
  // needs to replace an existing one instead.
  const handleRegenerate = async (assistantMessageId: string) => {
    const idx = messages.findIndex((m) => m.id === assistantMessageId)
    const priorUserMessage = idx > 0 ? messages[idx - 1] : null
    if (!priorUserMessage || priorUserMessage.role !== 'user') return

    setRegeneratingId(assistantMessageId)
    try {
      const response = await api.ai.askTutor(priorUserMessage.content, { language })
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? { ...m, content: response.answer, timestamp: new Date() } : m))
      )
    } catch {
      toast({ title: t('errorTitle'), description: t('errorDescription'), variant: 'destructive' })
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            GPT-4
          </Badge>
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-[140px]" aria-label={t('languageLabel')}>
              <Languages className="h-4 w-4 mr-1 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">{t('languageOptions.fr')}</SelectItem>
              <SelectItem value="en">{t('languageOptions.en')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <QuickAction icon={BookOpen} label={t('quickActions.summarize')} onClick={() => setInput(t('quickActionPrompts.summarize'))} />
        <QuickAction icon={Lightbulb} label={t('quickActions.explain')} onClick={() => setInput(t('quickActionPrompts.explain'))} />
        <QuickAction icon={HelpCircle} label={t('quickActions.quiz')} onClick={() => setInput(t('quickActionPrompts.quiz'))} />
      </div>

      {/* Messages */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onCopy={() => copyToClipboard(message.content)}
              onSuggestionClick={handleSuggestionClick}
              onRegenerate={() => handleRegenerate(message.id)}
              isRegenerating={regeneratingId === message.id}
            />
          ))}

          {isTyping && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-100" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2">
            <Input
              placeholder={t('placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!input.trim() || isTyping}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<any>
  label: string
  onClick: () => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="whitespace-nowrap"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 mr-2" />
      {label}
    </Button>
  )
}

function MessageBubble({
  message,
  onCopy,
  onSuggestionClick,
  onRegenerate,
  isRegenerating,
}: {
  message: Message
  onCopy: () => void
  onSuggestionClick: (suggestion: string) => void
  onRegenerate: () => void
  isRegenerating: boolean
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-primary' : 'bg-primary/10'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          }`}
        >
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        </div>

        {!isUser && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRegenerate} disabled={isRegenerating}>
              {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            </Button>
          </div>
        )}

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.suggestions.map((suggestion, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onSuggestionClick(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
