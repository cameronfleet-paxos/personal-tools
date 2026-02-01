import { Settings2, FolderTree, Container, GitBranch, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SettingsCategory } from './SettingsPage'

interface SettingsSidebarProps {
  activeCategory: SettingsCategory
  onCategoryChange: (category: SettingsCategory) => void
}

interface CategoryItem {
  id: SettingsCategory
  label: string
  icon: typeof Settings2
}

const categories: CategoryItem[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'paths', label: 'Paths & Tools', icon: FolderTree },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'repositories', label: 'Repositories', icon: GitBranch },
  { id: 'plans', label: 'Plans', icon: ListTodo },
]

export function SettingsSidebar({ activeCategory, onCategoryChange }: SettingsSidebarProps) {
  return (
    <div className="w-64 border-r bg-muted/10">
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Categories
        </h2>
        <nav className="space-y-1">
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onCategoryChange(id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeCategory === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
