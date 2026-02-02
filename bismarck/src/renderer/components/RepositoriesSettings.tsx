import { useState, useEffect } from 'react'
import { Pencil, Check, X, Plus, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Textarea } from '@/renderer/components/ui/textarea'
import type { Repository } from '@/shared/types'

export function RepositoriesSettings() {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Repository>>({})
  const [loading, setLoading] = useState(true)

  // Load repositories on mount
  useEffect(() => {
    loadRepositories()
  }, [])

  const loadRepositories = async () => {
    setLoading(true)
    try {
      const repos = await window.electron.getAllRepositories()
      setRepositories(repos)
    } catch (error) {
      console.error('Failed to load repositories:', error)
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (repo: Repository) => {
    setEditingId(repo.id)
    setEditForm({
      purpose: repo.purpose || '',
      completionCriteria: repo.completionCriteria || '',
      protectedBranches: repo.protectedBranches || [],
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEditing = async (repoId: string) => {
    try {
      await window.electron.updateRepository(repoId, {
        purpose: editForm.purpose || undefined,
        completionCriteria: editForm.completionCriteria || undefined,
        protectedBranches: editForm.protectedBranches || undefined,
      })
      await loadRepositories()
      setEditingId(null)
      setEditForm({})
    } catch (error) {
      console.error('Failed to update repository:', error)
    }
  }

  const deleteRepository = async (repoId: string) => {
    if (!confirm('Are you sure you want to remove this repository from tracking?')) {
      return
    }
    try {
      await window.electron.removeRepository(repoId)
      await loadRepositories()
    } catch (error) {
      console.error('Failed to delete repository:', error)
    }
  }

  const refreshRepository = async (repoId: string) => {
    try {
      await window.electron.refreshRepository(repoId)
      await loadRepositories()
    } catch (error) {
      console.error('Failed to refresh repository:', error)
    }
  }

  const addProtectedBranch = () => {
    const branches = editForm.protectedBranches || []
    setEditForm({
      ...editForm,
      protectedBranches: [...branches, ''],
    })
  }

  const updateProtectedBranch = (index: number, value: string) => {
    const branches = [...(editForm.protectedBranches || [])]
    branches[index] = value
    setEditForm({
      ...editForm,
      protectedBranches: branches,
    })
  }

  const removeProtectedBranch = (index: number) => {
    const branches = [...(editForm.protectedBranches || [])]
    branches.splice(index, 1)
    setEditForm({
      ...editForm,
      protectedBranches: branches,
    })
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading repositories...
      </div>
    )
  }

  if (repositories.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No repositories detected. Create an agent in a git repository to track it here.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {repositories.map((repo) => {
        const isEditing = editingId === repo.id

        return (
          <div
            key={repo.id}
            className="border rounded-lg p-4 space-y-3"
          >
            {/* Repository Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-base">{repo.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {repo.rootPath}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Branch: {repo.defaultBranch}</span>
                  {repo.remoteUrl && (
                    <span className="truncate max-w-xs">{repo.remoteUrl}</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => refreshRepository(repo.id)}
                      title="Refresh repository info"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditing(repo)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRepository(repo.id)}
                      title="Remove repository"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {isEditing && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => saveEditing(repo.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelEditing}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Editable Fields */}
            <div className="space-y-3 pt-2 border-t">
              {/* Purpose */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Purpose
                </label>
                {isEditing ? (
                  <Textarea
                    value={editForm.purpose || ''}
                    onChange={(e) =>
                      setEditForm({ ...editForm, purpose: e.target.value })
                    }
                    placeholder="What is this repository for?"
                    rows={2}
                    className="text-sm"
                  />
                ) : (
                  <p className="text-sm">
                    {repo.purpose || (
                      <span className="text-muted-foreground italic">
                        No purpose set
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Completion Criteria */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Completion Criteria
                </label>
                {isEditing ? (
                  <Textarea
                    value={editForm.completionCriteria || ''}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        completionCriteria: e.target.value,
                      })
                    }
                    placeholder="How do you know when work is complete?"
                    rows={2}
                    className="text-sm"
                  />
                ) : (
                  <p className="text-sm">
                    {repo.completionCriteria || (
                      <span className="text-muted-foreground italic">
                        No completion criteria set
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Protected Branches */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Protected Branches
                </label>
                {isEditing ? (
                  <div className="space-y-2">
                    {(editForm.protectedBranches || []).map((branch, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={branch}
                          onChange={(e) =>
                            updateProtectedBranch(index, e.target.value)
                          }
                          placeholder="Branch name"
                          className="text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeProtectedBranch(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addProtectedBranch}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Branch
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm">
                    {repo.protectedBranches && repo.protectedBranches.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {repo.protectedBranches.map((branch, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-muted rounded text-xs"
                          >
                            {branch}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">
                        No protected branches
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
