import { Pencil, Trash2, Play, Square } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import type { Workspace } from '@/shared/types'
import { themes } from '@/shared/constants'

interface WorkspaceCardProps {
  workspace: Workspace
  isActive: boolean
  isWaiting?: boolean
  onEdit: () => void
  onDelete: () => void
  onLaunch: () => void
  onStop: () => void
  onClick: () => void
}

export function WorkspaceCard({
  workspace,
  isActive,
  isWaiting,
  onEdit,
  onDelete,
  onLaunch,
  onStop,
  onClick,
}: WorkspaceCardProps) {
  const themeColors = themes[workspace.theme]

  return (
    <div
      className={`
        relative rounded-lg border p-4 cursor-pointer transition-all
        ${isActive ? 'ring-2 ring-primary' : 'hover:border-primary/50'}
        ${isWaiting ? 'animate-pulse ring-2 ring-yellow-500' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: themeColors.bg }}
          />
          <h3 className="font-medium">{workspace.name}</h3>
          {isWaiting && (
            <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded">
              Waiting
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground truncate mb-3">
        {workspace.directory}
      </p>
      <div className="flex gap-2">
        {isActive ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onLaunch()
            }}
          >
            <Play className="h-3 w-3 mr-1" />
            Launch
          </Button>
        )}
      </div>
    </div>
  )
}
