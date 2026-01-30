import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog'
import { Label } from '@/renderer/components/ui/label'
import type { AppPreferences, AttentionMode } from '@/shared/types'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preferences: AppPreferences
  onPreferencesChange: (preferences: Partial<AppPreferences>) => void
}

export function SettingsModal({
  open,
  onOpenChange,
  preferences,
  onPreferencesChange,
}: SettingsModalProps) {
  const handleAttentionModeChange = (mode: AttentionMode) => {
    onPreferencesChange({ attentionMode: mode })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-3">
            <Label className="text-base font-medium">Attention Mode</Label>
            <p className="text-sm text-muted-foreground">
              How waiting agents are displayed
            </p>
            <div className="grid gap-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="attentionMode"
                  value="focus"
                  checked={preferences.attentionMode === 'focus'}
                  onChange={() => handleAttentionModeChange('focus')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">Focus</div>
                  <div className="text-sm text-muted-foreground">
                    Waiting agents pulse with a yellow ring in their grid position
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="attentionMode"
                  value="expand"
                  checked={preferences.attentionMode === 'expand'}
                  onChange={() => handleAttentionModeChange('expand')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">Expand</div>
                  <div className="text-sm text-muted-foreground">
                    Waiting agent expands to fullscreen. Use Next button or hotkey to cycle through queue.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
