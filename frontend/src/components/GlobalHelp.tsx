import { useEffect, useMemo, useState } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { X, HelpCircle, ArrowLeft, Search } from 'lucide-react'
import { helpTopics, HelpTopic } from '@/lib/helpContent'

function findTopicForPath(pathname: string): HelpTopic {
  const specific = helpTopics.find(
    (t) => t.pattern !== '*' && matchPath({ path: t.pattern, end: true }, pathname)
  )
  if (specific) return specific
  return helpTopics.find((t) => t.pattern === '*')!
}

/** Dispatched by the header's help button so it can open the panel without prop-drilling
 * through MainLayout — GlobalHelp is mounted once at the app root, outside the layout. */
export const OPEN_HELP_EVENT = 'eformation:open-help'

export function openGlobalHelp() {
  window.dispatchEvent(new Event(OPEN_HELP_EVENT))
}

export function GlobalHelp() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [browsingTopic, setBrowsingTopic] = useState<HelpTopic | null>(null)
  const [browseSearch, setBrowseSearch] = useState('')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        setIsOpen((v) => {
          const next = !v
          // Opening the panel always starts from the current page's topic
          if (next) setBrowsingTopic(null)
          return next
        })
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    const handleOpenEvent = () => {
      setBrowsingTopic(null)
      setIsOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener(OPEN_HELP_EVENT, handleOpenEvent)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(OPEN_HELP_EVENT, handleOpenEvent)
    }
  }, [])

  // Reset the "browsing another topic" view whenever the user navigates
  useEffect(() => {
    setBrowsingTopic(null)
  }, [location.pathname])

  const currentTopic = useMemo(() => findTopicForPath(location.pathname), [location.pathname])
  const displayedTopic = browsingTopic || currentTopic

  const filteredTopics = useMemo(() => {
    const list = helpTopics.filter((t) => t.pattern !== '*')
    if (!browseSearch.trim()) return list
    const q = browseSearch.trim().toLowerCase()
    return list.filter((t) => t.title.toLowerCase().includes(q))
  }, [browseSearch])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-background border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary shrink-0" />
            <h2 className="font-semibold">Aide</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer l'aide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {browsingTopic && (
            <button
              type="button"
              onClick={() => setBrowsingTopic(null)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Revenir à l'aide de cette page
            </button>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-2">{displayedTopic.title}</h3>
            <ul className="space-y-2">
              {displayedTopic.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-primary">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Toutes les rubriques</p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder="Filtrer les rubriques..."
                className="w-full rounded-md border border-input bg-background pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <ul className="space-y-0.5 max-h-64 overflow-y-auto">
              {filteredTopics.map((topic) => (
                <li key={topic.pattern}>
                  <button
                    type="button"
                    onClick={() => setBrowsingTopic(topic)}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted ${
                      topic.pattern === displayedTopic.pattern ? 'bg-muted font-medium' : ''
                    }`}
                  >
                    {topic.title}
                  </button>
                </li>
              ))}
              {filteredTopics.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">Aucune rubrique trouvée</li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t p-3 text-center text-xs text-muted-foreground">
          Appuyez sur <kbd className="rounded border bg-muted px-1 py-0.5">F1</kbd> à tout moment pour ouvrir ou fermer l'aide
        </div>
      </div>
    </div>
  )
}
