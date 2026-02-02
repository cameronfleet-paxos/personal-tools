import { useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Input } from '@/renderer/components/ui/input'
import { Label } from '@/renderer/components/ui/label'

interface DockerSettingsProps {
  images: string[]
  resourceLimits: {
    cpu: string
    memory: string
  }
  onSettingsChange: (updates: {
    images?: string[]
    resourceLimits?: { cpu: string; memory: string }
  }) => void
}

export function DockerSettings({
  images,
  resourceLimits,
  onSettingsChange,
}: DockerSettingsProps) {
  const [newImageName, setNewImageName] = useState('')
  const [imageError, setImageError] = useState<string | null>(null)

  const handleAddImage = () => {
    const trimmed = newImageName.trim()
    if (!trimmed) {
      setImageError('Image name cannot be empty')
      return
    }

    // Basic Docker image name validation
    // Format: [registry/][namespace/]name[:tag]
    const dockerImageRegex = /^([a-z0-9]+([._-][a-z0-9]+)*\/)*[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9._-]+)?$/
    if (!dockerImageRegex.test(trimmed)) {
      setImageError('Invalid Docker image name format')
      return
    }

    if (images.includes(trimmed)) {
      setImageError('Image already exists in the list')
      return
    }

    onSettingsChange({ images: [...images, trimmed] })
    setNewImageName('')
    setImageError(null)
  }

  const handleRemoveImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index)
    onSettingsChange({ images: updated })
  }

  const handleResourceLimitChange = (field: 'cpu' | 'memory', value: string) => {
    onSettingsChange({
      resourceLimits: {
        ...resourceLimits,
        [field]: value,
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">Docker Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure Docker images and resource limits for headless agents
        </p>
      </div>

      {/* Docker Images */}
      <div className="space-y-4">
        <div>
          <Label className="text-base font-medium">Docker Images</Label>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Available Docker images for headless task agents
          </p>

          {/* Image list */}
          <div className="space-y-2 mb-3">
            {images.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
                No Docker images configured. Add one below to get started.
              </div>
            ) : (
              images.map((image, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                >
                  <code className="flex-1 text-sm font-mono">{image}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveImage(index)}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Add image form */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g., bismarck-agent:latest"
                value={newImageName}
                onChange={(e) => {
                  setNewImageName(e.target.value)
                  setImageError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddImage()
                  }
                }}
                className={imageError ? 'border-red-500' : ''}
              />
              {imageError && (
                <p className="text-xs text-red-500 mt-1">{imageError}</p>
              )}
            </div>
            <Button onClick={handleAddImage} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* Resource Limits */}
        <div className="pt-4 border-t">
          <Label className="text-base font-medium">Resource Limits</Label>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Default CPU and memory limits for Docker containers
          </p>

          <div className="grid gap-4 max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="cpu-limit">CPU Cores</Label>
              <Input
                id="cpu-limit"
                type="text"
                placeholder="e.g., 2"
                value={resourceLimits.cpu}
                onChange={(e) => handleResourceLimitChange('cpu', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Number of CPU cores allocated to each container
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-limit">Memory</Label>
              <Input
                id="memory-limit"
                type="text"
                placeholder="e.g., 4g"
                value={resourceLimits.memory}
                onChange={(e) => handleResourceLimitChange('memory', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Memory limit (e.g., 4g for 4 gigabytes, 512m for 512 megabytes)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
