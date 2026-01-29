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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select'
import type { Workspace, ThemeName } from '@/shared/types'
import { themes } from '@/shared/constants'

interface WorkspaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace?: Workspace
  onSave: (workspace: Workspace) => void
}

const themeNames = Object.keys(themes) as ThemeName[]

export function WorkspaceModal({
  open,
  onOpenChange,
  workspace,
  onSave,
}: WorkspaceModalProps) {
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [theme, setTheme] = useState<ThemeName>('gray')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (workspace) {
      setName(workspace.name)
      setDirectory(workspace.directory)
      setTheme(workspace.theme)
    } else {
      setName('')
      setDirectory('')
      setTheme('gray')
    }
    setError(null)
  }, [workspace, open])

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!directory.trim()) {
      setError('Directory is required')
      return
    }

    const newWorkspace: Workspace = {
      id: workspace?.id || crypto.randomUUID(),
      name: name.trim(),
      directory: directory.trim(),
      theme,
    }

    onSave(newWorkspace)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {workspace ? 'Edit Workspace' : 'Add Workspace'}
          </DialogTitle>
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
            <Label htmlFor="directory">Directory</Label>
            <Input
              id="directory"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="/Users/cameron/dev/pax"
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
                className="w-10 h-10 rounded-md border border-border"
                style={{ backgroundColor: themes[theme].bg }}
              />
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
