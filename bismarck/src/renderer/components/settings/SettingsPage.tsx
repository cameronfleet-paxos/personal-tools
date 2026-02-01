import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { SettingsSidebar } from './SettingsSidebar'
import { RepositoriesSettings } from './RepositoriesSettings'

export type SettingsCategory = 'general' | 'paths' | 'docker' | 'repositories' | 'plans'

interface SettingsPageProps {
  onClose: () => void
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar Navigation */}
      <SettingsSidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close settings"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            {activeCategory === 'general' && (
              <div className="text-muted-foreground">General settings placeholder</div>
            )}
            {activeCategory === 'paths' && (
              <div className="text-muted-foreground">Paths settings placeholder</div>
            )}
            {activeCategory === 'docker' && (
              <div className="text-muted-foreground">Docker settings placeholder</div>
            )}
            {activeCategory === 'repositories' && <RepositoriesSettings />}
            {activeCategory === 'plans' && (
              <div className="text-muted-foreground">Plans settings placeholder</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
