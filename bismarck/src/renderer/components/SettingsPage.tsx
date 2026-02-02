import { useState } from 'react'
import { X, Settings, Palette, Bot, Keyboard } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Label } from '@/renderer/components/ui/label'
import type { AppPreferences, AttentionMode, OperatingMode, AgentModel, GridSize } from '@/shared/types'
import { cn } from '@/lib/utils'

interface SettingsPageProps {
  open: boolean
  onClose: () => void
  preferences: AppPreferences
  onPreferencesChange: (preferences: Partial<AppPreferences>) => void
}

type SettingsCategory = 'general' | 'appearance' | 'agent' | 'shortcuts'

export function SettingsPage({
  open,
  onClose,
  preferences,
  onPreferencesChange,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')

  if (!open) return null

  const handleAttentionModeChange = (mode: AttentionMode) => {
    onPreferencesChange({ attentionMode: mode })
  }

  const handleOperatingModeChange = (mode: OperatingMode) => {
    onPreferencesChange({ operatingMode: mode })
  }

  const handleAgentModelChange = (model: AgentModel) => {
    onPreferencesChange({ agentModel: model })
  }

  const handleGridSizeChange = (size: GridSize) => {
    onPreferencesChange({ gridSize: size })
  }

  const categories = [
    {
      id: 'general' as const,
      label: 'General',
      icon: Settings,
    },
    {
      id: 'appearance' as const,
      label: 'Appearance',
      icon: Palette,
    },
    {
      id: 'agent' as const,
      label: 'Agent',
      icon: Bot,
    },
    {
      id: 'shortcuts' as const,
      label: 'Shortcuts',
      icon: Keyboard,
    },
  ]

  return (
    <aside className="fixed inset-0 z-40 bg-background flex">
      {/* Sidebar Navigation */}
      <div className="w-[200px] border-r flex flex-col">
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="font-medium">Settings</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {categories.map((category) => {
              const Icon = category.icon
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                    activeCategory === category.id
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {category.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          {activeCategory === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-1">General Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Configure general application behavior
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3">
                  <Label className="text-base font-medium">Operating Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    How agents work together
                  </p>
                  <div className="grid gap-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="operatingMode"
                        value="solo"
                        checked={preferences.operatingMode === 'solo'}
                        onChange={() => handleOperatingModeChange('solo')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Solo</div>
                        <div className="text-sm text-muted-foreground">
                          Run agents independently without coordination
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="operatingMode"
                        value="team"
                        checked={preferences.operatingMode === 'team'}
                        onChange={() => handleOperatingModeChange('team')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Team</div>
                        <div className="text-sm text-muted-foreground">
                          Enable plans sidebar. Leader agents delegate tasks to workers via bd.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

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

                <div className="grid gap-3">
                  <Label className="text-base font-medium">Grid Size</Label>
                  <p className="text-sm text-muted-foreground">
                    Layout configuration for agent workspace grid
                  </p>
                  <div className="grid gap-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="gridSize"
                        value="1x1"
                        checked={preferences.gridSize === '1x1'}
                        onChange={() => handleGridSizeChange('1x1')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">1x1</div>
                        <div className="text-sm text-muted-foreground">
                          Single agent workspace (fullscreen)
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="gridSize"
                        value="2x2"
                        checked={preferences.gridSize === '2x2'}
                        onChange={() => handleGridSizeChange('2x2')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">2x2</div>
                        <div className="text-sm text-muted-foreground">
                          Four agent workspaces in a 2x2 grid
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="gridSize"
                        value="2x3"
                        checked={preferences.gridSize === '2x3'}
                        onChange={() => handleGridSizeChange('2x3')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">2x3</div>
                        <div className="text-sm text-muted-foreground">
                          Six agent workspaces in a 2x3 grid
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="gridSize"
                        value="3x3"
                        checked={preferences.gridSize === '3x3'}
                        onChange={() => handleGridSizeChange('3x3')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">3x3</div>
                        <div className="text-sm text-muted-foreground">
                          Nine agent workspaces in a 3x3 grid
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-1">Appearance</h3>
                <p className="text-sm text-muted-foreground">
                  Customize the look and feel of the application
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Appearance settings coming soon...
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'agent' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-1">Agent Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Configure agent behavior and model selection
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3">
                  <Label className="text-base font-medium">Agent Model</Label>
                  <p className="text-sm text-muted-foreground">
                    Model used for headless task agents in Team mode
                  </p>
                  <div className="grid gap-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="agentModel"
                        value="sonnet"
                        checked={preferences.agentModel === 'sonnet'}
                        onChange={() => handleAgentModelChange('sonnet')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Sonnet</div>
                        <div className="text-sm text-muted-foreground">
                          Best balance of speed, cost, and capability
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="agentModel"
                        value="opus"
                        checked={preferences.agentModel === 'opus'}
                        onChange={() => handleAgentModelChange('opus')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Opus</div>
                        <div className="text-sm text-muted-foreground">
                          Most capable model, higher cost
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="agentModel"
                        value="haiku"
                        checked={preferences.agentModel === 'haiku'}
                        onChange={() => handleAgentModelChange('haiku')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Haiku</div>
                        <div className="text-sm text-muted-foreground">
                          Fastest and most affordable, good for simpler tasks
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'shortcuts' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-1">Keyboard Shortcuts</h3>
                <p className="text-sm text-muted-foreground">
                  View and customize keyboard shortcuts
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Keyboard shortcuts coming soon...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
