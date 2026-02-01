import { useState, useEffect } from 'react'
import { GitBranch, Pencil, Check, X, FolderGit2 } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Textarea } from '@/renderer/components/ui/textarea'
import type { Repository } from '@/shared/types'

interface EditingState {
  repositoryId: string
  field: 'name' | 'purpose' | 'completionCriteria' | 'protectedBranches'
  value: string
}

export function RepositoriesSettings() {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [loading, setLoading] = useState(true)

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

  const startEditing = (
    repositoryId: string,
    field: 'name' | 'purpose' | 'completionCriteria' | 'protectedBranches',
    currentValue: string | string[] | undefined
  ) => {
    let value = ''
    if (field === 'protectedBranches') {
      value = Array.isArray(currentValue) ? currentValue.join(', ') : ''
    } else {
      value = currentValue || ''
    }
    setEditing({ repositoryId, field, value })
  }

  const cancelEditing = () => {
    setEditing(null)
  }

  const saveEdit = async () => {
    if (!editing) return

    try {
      let updateValue: string | string[] = editing.value
      if (editing.field === 'protectedBranches') {
        // Split by comma and trim whitespace
        updateValue = editing.value
          .split(',')
          .map(b => b.trim())
          .filter(b => b.length > 0)
      }

      const updated = await window.electronAPI.updateRepository(editing.repositoryId, {
        [editing.field]: updateValue,
      })

      if (updated) {
        setRepositories(repos =>
          repos.map(r => (r.id === updated.id ? updated : r))
        )
      }
      setEditing(null)
    } catch (error) {
      console.error('Failed to update repository:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading repositories...</div>
      </div>
    )
  }

  if (repositories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderGit2 className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No repositories found</h3>
        <p className="text-muted-foreground">
          Repositories will appear here when you create agents in git repositories.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Repositories</h2>
        <p className="text-muted-foreground text-sm">
          Manage repository settings and configuration for your projects.
        </p>
      </div>

      <div className="space-y-4">
        {repositories.map(repo => (
          <div
            key={repo.id}
            className="border rounded-lg p-4 hover:border-muted-foreground/50 transition-colors"
          >
            {/* Repository Name */}
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 flex items-center gap-2">
                {editing?.repositoryId === repo.id && editing.field === 'name' ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editing.value}
                      onChange={e => setEditing({ ...editing, value: e.target.value })}
                      className="flex-1"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit()
                        if (e.key === 'Escape') cancelEditing()
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold text-lg">{repo.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditing(repo.id, 'name', repo.name)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Repository Path */}
            <div className="text-sm text-muted-foreground mb-3 pl-7">
              {repo.rootPath}
            </div>

            {/* Default Branch and Remote */}
            <div className="grid grid-cols-2 gap-4 mb-3 pl-7 text-sm">
              <div>
                <span className="text-muted-foreground">Default Branch:</span>{' '}
                <span className="font-mono">{repo.defaultBranch}</span>
              </div>
              {repo.remoteUrl && (
                <div>
                  <span className="text-muted-foreground">Remote:</span>{' '}
                  <span className="font-mono text-xs">{repo.remoteUrl}</span>
                </div>
              )}
            </div>

            {/* Editable Fields */}
            <div className="space-y-3 pl-7">
              {/* Purpose */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Purpose
                </label>
                {editing?.repositoryId === repo.id && editing.field === 'purpose' ? (
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={editing.value}
                      onChange={e => setEditing({ ...editing, value: e.target.value })}
                      className="flex-1 min-h-[60px]"
                      placeholder="What is this repository for?"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') cancelEditing()
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" onClick={saveEdit}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => startEditing(repo.id, 'purpose', repo.purpose)}
                    className="cursor-pointer hover:bg-muted/50 p-2 rounded border border-transparent hover:border-muted-foreground/20 transition-colors min-h-[60px] flex items-center"
                  >
                    {repo.purpose ? (
                      <span className="text-sm">{repo.purpose}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        Click to add a purpose description...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Completion Criteria */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Completion Criteria
                </label>
                {editing?.repositoryId === repo.id &&
                editing.field === 'completionCriteria' ? (
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={editing.value}
                      onChange={e => setEditing({ ...editing, value: e.target.value })}
                      className="flex-1 min-h-[60px]"
                      placeholder="What does 'done' look like?"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') cancelEditing()
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" onClick={saveEdit}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() =>
                      startEditing(repo.id, 'completionCriteria', repo.completionCriteria)
                    }
                    className="cursor-pointer hover:bg-muted/50 p-2 rounded border border-transparent hover:border-muted-foreground/20 transition-colors min-h-[60px] flex items-center"
                  >
                    {repo.completionCriteria ? (
                      <span className="text-sm">{repo.completionCriteria}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        Click to define completion criteria...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Protected Branches */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Protected Branches
                </label>
                {editing?.repositoryId === repo.id &&
                editing.field === 'protectedBranches' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editing.value}
                      onChange={e => setEditing({ ...editing, value: e.target.value })}
                      className="flex-1"
                      placeholder="main, master, production (comma-separated)"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit()
                        if (e.key === 'Escape') cancelEditing()
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() =>
                      startEditing(repo.id, 'protectedBranches', repo.protectedBranches)
                    }
                    className="cursor-pointer hover:bg-muted/50 p-2 rounded border border-transparent hover:border-muted-foreground/20 transition-colors flex items-center"
                  >
                    {repo.protectedBranches && repo.protectedBranches.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {repo.protectedBranches.map(branch => (
                          <span
                            key={branch}
                            className="px-2 py-0.5 bg-muted rounded text-xs font-mono"
                          >
                            {branch}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        Click to add protected branches...
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
