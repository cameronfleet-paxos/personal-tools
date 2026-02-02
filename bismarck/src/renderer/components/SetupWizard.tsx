import { useState, useEffect } from 'react'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Logo } from '@/renderer/components/Logo'
import { FolderOpen, ChevronLeft, Loader2 } from 'lucide-react'
import type { DiscoveredRepo } from '@/shared/types'

interface SetupWizardProps {
  onComplete: () => void
}

type WizardStep = 'path-selection' | 'repo-selection'

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('path-selection')
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [manualPath, setManualPath] = useState<string>('')
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([])
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load suggested paths on mount
  useEffect(() => {
    loadSuggestedPaths()
  }, [])

  const loadSuggestedPaths = async () => {
    try {
      const paths = await window.electronAPI?.getCommonRepoPaths?.()
      setSuggestedPaths(paths || [])
    } catch (err) {
      console.error('Failed to load suggested paths:', err)
    }
  }

  const handleFolderPicker = async () => {
    try {
      setError(null)
      const path = await window.electronAPI?.showFolderPicker?.()
      if (path) {
        setSelectedPath(path)
        setManualPath(path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder picker')
    }
  }

  const handlePathSelect = (path: string) => {
    setSelectedPath(path)
    setManualPath(path)
    setError(null)
  }

  const handleContinueToRepoSelection = async () => {
    const pathToScan = manualPath || selectedPath
    if (!pathToScan) {
      setError('Please select a directory')
      return
    }

    setIsScanning(true)
    setError(null)

    try {
      const repos = await window.electronAPI?.scanForRepositories?.(pathToScan, 2)
      if (!repos || repos.length === 0) {
        setError('No repositories found')
        setDiscoveredRepos([])
      } else {
        setDiscoveredRepos(repos)
        setCurrentStep('repo-selection')
        // Auto-select all repos by default
        setSelectedRepos(new Set(repos.map(r => r.path)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan for repositories')
    } finally {
      setIsScanning(false)
    }
  }

  const handleToggleRepo = (repoPath: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repoPath)) {
        next.delete(repoPath)
      } else {
        next.add(repoPath)
      }
      return next
    })
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

    setIsCreating(true)
    setError(null)

    try {
      const reposToCreate = discoveredRepos.filter(r => selectedRepos.has(r.path))
      await window.electronAPI?.bulkCreateAgents?.(reposToCreate, selectedPath || manualPath)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agents')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSkipSetup = () => {
    onComplete()
  }

  return (
    <div className="h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Wizard Card */}
        <div className="border rounded-lg bg-card shadow-lg">
          {/* Header */}
          <div className="border-b px-6 py-4 flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-xl font-semibold">Welcome to Bismarck</h1>
              <p className="text-sm text-muted-foreground">
                Let's set up your first agents
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {currentStep === 'path-selection' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium mb-2">Select a directory</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose a parent directory to scan for Git repositories
                  </p>
                </div>

                {/* Folder Picker Button */}
                <div>
                  <Button
                    onClick={handleFolderPicker}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Choose Folder...
                  </Button>
                </div>

                {/* Suggested Paths */}
                {suggestedPaths.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Suggested paths:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPaths.map(path => (
                        <button
                          key={path}
                          onClick={() => handlePathSelect(path)}
                          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                            selectedPath === path
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted border-border'
                          }`}
                        >
                          {path}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Path Input */}
                <div>
                  <p className="text-sm font-medium mb-2">Or enter a path manually:</p>
                  <Input
                    value={manualPath}
                    onChange={(e) => {
                      setManualPath(e.target.value)
                      setSelectedPath(e.target.value)
                      setError(null)
                    }}
                    placeholder="/path/to/your/projects"
                    className="font-mono text-sm"
                  />
                </div>

                {/* Error Message */}
                {error && (
                  <div className="px-3 py-2 bg-destructive/10 text-destructive rounded-md text-sm">
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-4">
                  <Button
                    variant="ghost"
                    onClick={handleSkipSetup}
                  >
                    Skip Setup
                  </Button>
                  <Button
                    onClick={handleContinueToRepoSelection}
                    disabled={!selectedPath && !manualPath || isScanning}
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 'repo-selection' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium mb-1">Select repositories</h2>
                    <p className="text-sm text-muted-foreground">
                      Choose which repositories to create agents for
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentStep('path-selection')}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                </div>

                {discoveredRepos.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">No repositories found</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentStep('path-selection')}
                      >
                        Go Back
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSkipSetup}
                      >
                        Skip Setup
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Select All / Deselect All */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAll}
                      >
                        Deselect All
                      </Button>
                      <div className="flex-1" />
                      <span className="text-sm text-muted-foreground self-center">
                        {selectedRepos.size} of {discoveredRepos.length} selected
                      </span>
                    </div>

                    {/* Repository List */}
                    <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                      {discoveredRepos.map(repo => {
                        const isSelected = selectedRepos.has(repo.path)
                        return (
                          <label
                            key={repo.path}
                            className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRepo(repo.path)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{repo.name}</div>
                              <div className="text-xs text-muted-foreground truncate font-mono">
                                {repo.path}
                              </div>
                              {repo.remoteUrl && (
                                <div className="text-xs text-muted-foreground/70 truncate font-mono mt-0.5">
                                  {repo.remoteUrl}
                                </div>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="px-3 py-2 bg-destructive/10 text-destructive rounded-md text-sm">
                        {error}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between pt-4">
                      <Button
                        variant="ghost"
                        onClick={handleSkipSetup}
                      >
                        Skip Setup
                      </Button>
                      <Button
                        onClick={handleCreateAgents}
                        disabled={selectedRepos.size === 0 || isCreating}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating Agents...
                          </>
                        ) : (
                          `Create ${selectedRepos.size} Agent${selectedRepos.size === 1 ? '' : 's'}`
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
