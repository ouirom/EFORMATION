import { useTranslation } from 'react-i18next'

interface EmojiCategory {
  labelKey: string
  emojis: string[]
}

// Curated set (no external emoji-picker dependency) -- covers the common cases
// for a workplace chat without pulling in a full emoji database.
const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    labelKey: 'emojiCategories.frequent',
    emojis: ['😀', '😂', '😊', '😍', '👍', '🙏', '🎉', '❤️', '😢', '😮', '😅', '🔥'],
  },
  {
    labelKey: 'emojiCategories.faces',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '😘', '😋', '😛', '🤔', '🤨', '😐', '😑', '😴', '🤯',
      '😢', '😭', '😡', '😱', '😨', '🥳', '😎', '🤗',
    ],
  },
  {
    labelKey: 'emojiCategories.gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '✌️', '🤞', '👋', '🤦', '🤷'],
  },
  {
    labelKey: 'emojiCategories.objects',
    emojis: [
      '❤️', '🎉', '🔥', '💡', '📌', '✅', '❌', '⚠️', '📎', '📅', '⏰', '🚀',
      '🏆', '🎯', '📢', '💬',
    ],
  },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const { t } = useTranslation('chat')
  return (
    <div className="max-h-72 overflow-y-auto space-y-3">
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.labelKey}>
          <p className="text-xs font-medium text-muted-foreground mb-1">{t(category.labelKey)}</p>
          <div className="grid grid-cols-8 gap-1">
            {category.emojis.map((emoji, i) => (
              <button
                key={`${category.labelKey}-${i}`}
                type="button"
                className="text-xl rounded hover:bg-muted p-1 leading-none"
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
