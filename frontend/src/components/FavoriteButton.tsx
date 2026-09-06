import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

interface FavoriteButtonProps {
  type: 'course' | 'lesson'
  id: number
  showLabel?: boolean
  size?: 'default' | 'sm' | 'icon'
}

/** Favorite/unfavorite toggle for a course or a lesson. Every instance shares the
 * same ['favorites'] query cache, so toggling one place updates all of them. */
export function FavoriteButton({ type, id, showLabel = true, size = 'sm' }: FavoriteButtonProps) {
  const { t } = useTranslation('courses')
  const queryClient = useQueryClient()

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.favorites.list(),
  })

  const isFavorited = favorites.some((f: any) => f.type === type && f.itemId === id)

  const toggleMutation = useMutation({
    mutationFn: () => (isFavorited ? api.favorites.remove(type, id) : api.favorites.add(type, id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => toggleMutation.mutate()}
      disabled={toggleMutation.isPending}
      aria-pressed={isFavorited}
    >
      <Heart className={cn('h-4 w-4', showLabel && 'mr-1', isFavorited && 'fill-red-500 text-red-500')} />
      {showLabel && t('detail.favorites')}
    </Button>
  )
}
