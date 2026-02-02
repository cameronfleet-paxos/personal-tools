import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { Breadcrumb, type BreadcrumbItem } from '@/renderer/components/ui/breadcrumb'

type SettingsCategory = 'general' | 'paths' | 'docker' | 'repositories' | 'plans'

interface SettingsPageProps {
  onClose: () => void
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')

  const categories: { id: SettingsCategory; label: string; description: string }[] = [
    { id: 'general', label: 'General', description: 'Attention mode and grid size' },
    { id: 'paths', label: 'Paths & Tools', description: 'Configure tool paths' },
    { id: 'docker', label: 'Docker', description: 'Images and resource limits' },
    { id: 'repositories', label: 'Repositories', description: 'Manage repository settings' },
    { id: 'plans', label: 'Plans', description: 'Operating mode and agent model' },
  ]

  // Build breadcrumb items based on current location
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Home', onClick: onClose },
    { label: 'Settings', onClick: () => setActiveCategory('general') },
    { label: categories.find(c => c.id === activeCategory)?.label || '' },
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Settings</h1>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                activeCategory === category.id
                  ? 'bg-muted font-medium'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="text-sm">{category.label}</div>
              <div className="text-xs text-muted-foreground">{category.description}</div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          <Breadcrumb items={breadcrumbItems} className="mb-6" />
          {activeCategory === 'general' && (
            <div>
              <h2 className="text-2xl font-bold mb-2">General</h2>
              <p className="text-muted-foreground mb-6">
                Configure attention mode and grid size preferences
              </p>
              <div className="text-sm text-muted-foreground">
                General settings content will be implemented here
              </div>
            </div>
          )}

          {activeCategory === 'paths' && (
            <div>
              <h2 className="text-2xl font-bold mb-2">Paths & Tools</h2>
              <p className="text-muted-foreground mb-6">
                Configure paths for bd, gh, and git commands
              </p>
              <div className="text-sm text-muted-foreground">
                Paths & Tools settings content will be implemented here
              </div>
            </div>
          )}

          {activeCategory === 'docker' && (
            <div>
              <h2 className="text-2xl font-bold mb-2">Docker</h2>
              <p className="text-muted-foreground mb-6">
                Manage Docker images, resource limits, and proxied tools
              </p>
              <div className="text-sm text-muted-foreground">
                Docker settings content will be implemented here
              </div>
            </div>
          )}

          {activeCategory === 'repositories' && (
            <div>
              <h2 className="text-2xl font-bold mb-2">Repositories</h2>
              <p className="text-muted-foreground mb-6">
                Configure repository purpose, completion criteria, and protected branches
              </p>
              <div className="text-sm text-muted-foreground">
                Repositories settings content will be implemented here
              </div>
            </div>
          )}

          {activeCategory === 'plans' && (
            <div>
              <h2 className="text-2xl font-bold mb-2">Plans</h2>
              <p className="text-muted-foreground mb-6">
                Configure operating mode and agent model for task agents
              </p>
              <div className="text-sm text-muted-foreground">
                Plans settings content will be implemented here
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
