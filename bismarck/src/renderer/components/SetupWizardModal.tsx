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
import { FolderOpen, Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import type { DiscoveredRepo } from '@/shared/types'

interface SetupWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

type WizardStep = 'welcome' | 'select-path' | 'scanning' | 'review' | 'creating' | 'complete'

export function SetupWizardModal({ open, onOpenChange, onComplete }: SetupWizardModalProps) {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [customPath, setCustomPath] = useState<string>('')
  const [commonPaths, setCommonPaths] = useState<string[]>([])
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Load common paths when dialog opens
  useEffect(() => {
    if (open) {
      loadCommonPaths()
    }
  }, [open])

  const loadCommonPaths = async () => {
    try {
      const paths = await window.electronAPI.getCommonRepoPaths()
      setCommonPaths(paths)
    } catch (err) {
      console.error('Failed to load common paths:', err)
    }
  }

  const handleSelectPath = (path: string) => {
    setSelectedPath(path)
    setCustomPath('')
    setError(null)
  }

  const handleBrowseFolder = async () => {
    try {
      const path = await window.electronAPI.showFolderPicker()
      if (path) {
        setSelectedPath(path)
        setCustomPath(path)
        setError(null)
      }
    } catch (err) {
      setError('Failed to open folder picker')
      console.error('Folder picker error:', err)
    }
  }

  const handleScanPath = async () => {
    if (!selectedPath) {
      setError('Please select a directory to scan')
      return
    }

    setStep('scanning')
    setIsScanning(true)
    setError(null)

    try {
      const repos = await window.electronAPI.scanForRepositories(selectedPath, 2)
      setDiscoveredRepos(repos)

      // Auto-select all repos by default
      setSelectedRepos(new Set(repos.map(r => r.path)))

      setStep('review')
    } catch (err) {
      setError('Failed to scan directory')
      console.error('Scan error:', err)
      setStep('select-path')
    } finally {
      setIsScanning(false)
    }
  }

  const handleToggleRepo = (path: string) => {
    const newSelected = new Set(selectedRepos)
    if (newSelected.has(path)) {
      newSelected.delete(path)
    } else {
      newSelected.add(path)
    }
    setSelectedRepos(newSelected)
  }

  const handleSelectAll = () => {
    setSelectedRepos(new Set(discoveredRepos.map(r => r.path)))
  }

  const handleDeselectAll = () => {
    setSelectedRepos(new Set())
  }

  const handleCreateAgents = async () => {
    if (selectedRepos.size === 0) {
      setError('Please select at least one repository')
      return
    }

    setStep('creating')
    setIsCreating(true)
    setError(null)

    try {
      const reposToCreate = discoveredRepos.filter(r => selectedRepos.has(r.path))
      const createdIds = await window.electronAPI.bulkCreateAgents(reposToCreate, selectedPath)

      setCreatedCount(createdIds.length)
      setStep('complete')
    } catch (err) {
      setError('Failed to create agents')
      console.error('Agent creation error:', err)
      setStep('review')
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    // Reset state
    setStep('welcome')
    setSelectedPath('')
    setCustomPath('')
    setDiscoveredRepos([])
    setSelectedRepos(new Set())
    setError(null)
    setCreatedCount(0)
    onOpenChange(false)
  }

  const handleFinish = () => {
    handleClose()
    onComplete()
  }

  const renderStepContent = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="py-6 space-y-4">
            <div className="flex justify-center">
              <Sparkles className="h-16 w-16 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">Welcome to Bismarck!</h3>
              <p className="text-sm text-muted-foreground">
                Let's get you started by discovering your existing repositories and creating agents for them.
              </p>
              <p className="text-sm text-muted-foreground">
                We'll scan a directory of your choice and automatically set up agents for all git repositories found.
              </p>
            </div>
          </div>
        )

      case 'select-path':
        return (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Select a directory containing your repositories</Label>
              <p className="text-sm text-muted-foreground">
                We'll scan this directory and its subdirectories for git repositories.
              </p>
            </div>

            {commonPaths.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Common locations</Label>
                <div className="grid gap-2">
                  {commonPaths.map((path) => (
                    <button
                      key={path}
                      onClick={() => handleSelectPath(path)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                        selectedPath === path
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:bg-accent'
                      }`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Or choose a custom location</Label>
              <div className="flex gap-2">
                <Input
                  value={customPath}
                  onChange={(e) => {
                    setCustomPath(e.target.value)
                    setSelectedPath(e.target.value)
                    setError(null)
                  }}
                  placeholder="/path/to/your/repositories"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBrowseFolder}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )

      case 'scanning':
        return (
          <div className="py-8 space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">Scanning for repositories...</h3>
              <p className="text-sm text-muted-foreground">
                This may take a moment depending on the directory size.
              </p>
            </div>
          </div>
        )

      case 'review':
        return (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Found {discoveredRepos.length} repositories</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-7 text-xs"
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="h-7 text-xs"
                  >
                    Deselect all
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Select which repositories you'd like to create agents for.
              </p>
            </div>

            {discoveredRepos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No repositories found in this directory.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-2">
                {discoveredRepos.map((repo) => (
                  <button
                    key={repo.path}
                    onClick={() => handleToggleRepo(repo.path)}
                    className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      selectedRepos.has(repo.path)
                        ? 'border-primary bg-primary/10'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        selectedRepos.has(repo.path)
                          ? 'bg-primary border-primary'
                          : 'border-input'
                      }`}>
                        {selectedRepos.has(repo.path) && (
                          <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{repo.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{repo.path}</div>
                        {repo.remoteUrl && (
                          <div className="text-xs text-muted-foreground truncate">{repo.remoteUrl}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )

      case 'creating':
        return (
          <div className="py-8 space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">Creating agents...</h3>
              <p className="text-sm text-muted-foreground">
                Setting up {selectedRepos.size} agent{selectedRepos.size !== 1 ? 's' : ''} for your repositories.
              </p>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="py-6 space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium">All set!</h3>
              <p className="text-sm text-muted-foreground">
                Successfully created {createdCount} agent{createdCount !== 1 ? 's' : ''}.
              </p>
              <p className="text-sm text-muted-foreground">
                You can now start working with your repositories through Bismarck.
              </p>
            </div>
          </div>
        )
    }
  }

  const renderFooter = () => {
    switch (step) {
      case 'welcome':
        return (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Skip
            </Button>
            <Button onClick={() => setStep('select-path')}>
              Get Started
            </Button>
          </DialogFooter>
        )

      case 'select-path':
        return (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep('welcome')}>
              Back
            </Button>
            <Button onClick={handleScanPath} disabled={!selectedPath}>
              Scan Directory
            </Button>
          </DialogFooter>
        )

      case 'scanning':
        return null

      case 'review':
        return (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep('select-path')}>
              Back
            </Button>
            <Button onClick={handleCreateAgents} disabled={selectedRepos.size === 0}>
              Create {selectedRepos.size} Agent{selectedRepos.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        )

      case 'creating':
        return null

      case 'complete':
        return (
          <DialogFooter>
            <Button onClick={handleFinish}>
              Finish
            </Button>
          </DialogFooter>
        )
    }
  }

  const getStepTitle = () => {
    switch (step) {
      case 'welcome':
        return 'Welcome'
      case 'select-path':
        return 'Select Directory'
      case 'scanning':
        return 'Scanning'
      case 'review':
        return 'Review Repositories'
      case 'creating':
        return 'Creating Agents'
      case 'complete':
        return 'Complete'
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
        </DialogHeader>
        {renderStepContent()}
        {renderFooter()}
      </DialogContent>
    </Dialog>
  )
}
