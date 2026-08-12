interface EmojiCategory {
  label: string
  emojis: string[]
}

// Curated set (no external emoji-picker dependency) -- covers the common cases
// for a workplace chat without pulling in a full emoji database.
const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: 'Fréquents',
    emojis: ['😀', '😂', '😊', '😍', '👍', '🙏', '🎉', '❤️', '😢', '😮', '😅', '🔥'],
  },
  {
    label: 'Visages',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '😘', '😋', '😛', '🤔', '🤨', '😐', '😑', '😴', '🤯',
      '😢', '😭', '😡', '😱', '😨', '🥳', '😎', '🤗',
    ],
  },
  {
    label: 'Gestes & personnes',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '✌️', '🤞', '👋', '🤦', '🤷'],
  },
  {
    label: 'Objets & symboles',
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
  return (
    <div className="max-h-72 overflow-y-auto space-y-3">
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.label}>
          <p className="text-xs font-medium text-muted-foreground mb-1">{category.label}</p>
          <div className="grid grid-cols-8 gap-1">
            {category.emojis.map((emoji, i) => (
              <button
                key={`${category.label}-${i}`}
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
