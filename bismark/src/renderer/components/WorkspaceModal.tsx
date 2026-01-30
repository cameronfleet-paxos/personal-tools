import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/renderer/components/ui/dialog'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Label } from '@/renderer/components/ui/label'
import { Textarea } from '@/renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select'
import { AgentIcon } from '@/renderer/components/AgentIcon'
import type { Agent, ThemeName } from '@/shared/types'
import type { AgentIconName } from '@/shared/constants'
import { themes, agentIcons } from '@/shared/constants'

interface AgentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent
  onSave: (agent: Agent) => void
}

const themeNames = Object.keys(themes) as ThemeName[]

export function AgentModal({
  open,
  onOpenChange,
  agent,
  onSave,
}: AgentModalProps) {
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [purpose, setPurpose] = useState('')
  const [theme, setTheme] = useState<ThemeName>('gray')
  const [icon, setIcon] = useState<AgentIconName>('beethoven')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (agent) {
      setName(agent.name)
      setDirectory(agent.directory)
      setPurpose(agent.purpose || '')
      setTheme(agent.theme)
      setIcon(agent.icon || 'beethoven')
    } else {
      setName('')
      setDirectory('')
      setPurpose('')
      setTheme('gray')
      // Random icon for new agents
      setIcon(agentIcons[Math.floor(Math.random() * agentIcons.length)])
    }
    setError(null)
  }, [agent, open])

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!directory.trim()) {
      setError('Directory is required')
      return
    }

    const newAgent: Agent = {
      id: agent?.id || crypto.randomUUID(),
      name: name.trim(),
      directory: directory.trim(),
      purpose: purpose.trim(),
      theme,
      icon,
    }

    onSave(newAgent)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{agent ? 'Edit Agent' : 'Add Agent'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., pax-main"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="directory">Home Directory</Label>
            <Input
              id="directory"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="/Users/cameron/dev/pax"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Textarea
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Describe what this agent is for..."
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="theme">Theme</Label>
            <div className="flex items-center gap-3">
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeName)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  {themeNames.map((themeName) => (
                    <SelectItem key={themeName} value={themeName}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-sm border border-border"
                          style={{ backgroundColor: themes[themeName].bg }}
                        />
                        <span className="capitalize">{themeName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div
                className="w-10 h-10 rounded-md border border-border flex items-center justify-center"
                style={{ backgroundColor: themes[theme].bg }}
              >
                <AgentIcon icon={icon} className="w-7 h-7" />
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto p-1 border rounded-md">
              {agentIcons.map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                    icon === iconName
                      ? 'bg-primary ring-2 ring-primary'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                  title={iconName.charAt(0).toUpperCase() + iconName.slice(1)}
                >
                  <AgentIcon icon={iconName} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Backwards compatibility export
export { AgentModal as WorkspaceModal }
