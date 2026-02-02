import { useEffect, useState } from 'react'
import { Pencil, Check, X, Trash2, FolderGit2 } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Label } from '@/renderer/components/ui/label'
import { Textarea } from '@/renderer/components/ui/textarea'
import type { Repository } from '@/shared/types'
import { cn } from '@/lib/utils'

interface RepositoriesSettingsProps {
  onRepositoryUpdate?: (repo: Repository) => void
}

interface EditingState {
  repositoryId: string | null
  name: string
  purpose: string
  completionCriteria: string
  defaultBranch: string
  protectedBranches: string
}

export function RepositoriesSettings({ onRepositoryUpdate }: RepositoriesSettingsProps) {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [loading, setLoading] = useState(true)

  // Load repositories on mount
  useEffect(() => {
    loadRepositories()
  }, [])

  const loadRepositories = async () => {
    try {
      const repos = await window.electronAPI.getRepositories()
      setRepositories(repos)
    } catch (error) {
      console.error('Failed to load repositories:', error)
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (repo: Repository) => {
    setEditing({
      repositoryId: repo.id,
      name: repo.name,
      purpose: repo.purpose || '',
      completionCriteria: repo.completionCriteria || '',
      defaultBranch: repo.defaultBranch,
      protectedBranches: (repo.protectedBranches || []).join(', '),
    })
  }

  const cancelEditing = () => {
    setEditing(null)
  }

  const saveEditing = async () => {
    if (!editing || !editing.repositoryId) return

    try {
      const updates: Partial<Repository> = {
        name: editing.name,
        purpose: editing.purpose || undefined,
        completionCriteria: editing.completionCriteria || undefined,
        defaultBranch: editing.defaultBranch,
        protectedBranches: editing.protectedBranches
          .split(',')
          .map((b) => b.trim())
          .filter((b) => b.length > 0),
      }

      const updatedRepo = await window.electronAPI.updateRepository(editing.repositoryId, updates)

      if (updatedRepo) {
        setRepositories((prev) =>
          prev.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
        )
        onRepositoryUpdate?.(updatedRepo)
      }

      setEditing(null)
    } catch (error) {
      console.error('Failed to update repository:', error)
    }
  }

  const removeRepository = async (id: string) => {
    // In the future, we might want to add a confirmation dialog
    // For now, just filter it out locally - we'd need a removeRepository IPC handler
    setRepositories((prev) => prev.filter((r) => r.id !== id))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-1">Repositories</h3>
          <p className="text-sm text-muted-foreground">
            Loading repositories...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">Repositories</h3>
        <p className="text-sm text-muted-foreground">
          Manage auto-discovered repositories from your agents
        </p>
      </div>

      {repositories.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <FolderGit2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No repositories found. Create an agent in a git repository to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {repositories.map((repo) => {
            const isEditing = editing?.repositoryId === repo.id

            return (
              <div
                key={repo.id}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="Repository name"
                        className="font-medium"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{repo.name}</h4>
                      </div>
                    )}
                    {!isEditing && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {repo.rootPath}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={saveEditing}
                          className="h-8 w-8 p-0"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditing}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditing(repo)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-3">
                  {/* Purpose */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Purpose</Label>
                    {isEditing ? (
                      <Input
                        value={editing.purpose}
                        onChange={(e) => setEditing({ ...editing, purpose: e.target.value })}
                        placeholder="What is this repository for?"
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm">
                        {repo.purpose || (
                          <span className="text-muted-foreground italic">Not set</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Completion Criteria */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Completion Criteria</Label>
                    {isEditing ? (
                      <Textarea
                        value={editing.completionCriteria}
                        onChange={(e) =>
                          setEditing({ ...editing, completionCriteria: e.target.value })
                        }
                        placeholder="What does 'done' look like?"
                        className="text-sm min-h-[60px]"
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {repo.completionCriteria || (
                          <span className="text-muted-foreground italic">Not set</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Base Branch */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Base Branch</Label>
                      {isEditing ? (
                        <Input
                          value={editing.defaultBranch}
                          onChange={(e) =>
                            setEditing({ ...editing, defaultBranch: e.target.value })
                          }
                          placeholder="main"
                          className="text-sm"
                        />
                      ) : (
                        <p className="text-sm font-mono">{repo.defaultBranch}</p>
                      )}
                    </div>

                    {/* Protected Branches */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Protected Branches
                      </Label>
                      {isEditing ? (
                        <Input
                          value={editing.protectedBranches}
                          onChange={(e) =>
                            setEditing({ ...editing, protectedBranches: e.target.value })
                          }
                          placeholder="main, master"
                          className="text-sm"
                        />
                      ) : (
                        <p className="text-sm font-mono">
                          {repo.protectedBranches && repo.protectedBranches.length > 0 ? (
                            repo.protectedBranches.join(', ')
                          ) : (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Remote URL */}
                  {repo.remoteUrl && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Remote URL</Label>
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        {repo.remoteUrl}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
