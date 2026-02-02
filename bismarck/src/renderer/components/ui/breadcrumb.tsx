import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  isActive?: boolean
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
  separator?: React.ReactNode
}

function Breadcrumb({ items, className, separator }: BreadcrumbProps) {
  const defaultSeparator = (
    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
  )

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1", className)}>
      <ol className="flex items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const Icon = item.icon

          return (
            <React.Fragment key={index}>
              <li className="flex items-center gap-1">
                {item.onClick ? (
                  <button
                    onClick={item.onClick}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm transition-colors hover:text-foreground",
                      isLast || item.isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                    aria-current={isLast || item.isActive ? "page" : undefined}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm",
                      isLast || item.isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                    aria-current={isLast || item.isActive ? "page" : undefined}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="flex items-center">
                  {separator ?? defaultSeparator}
                </li>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumb, type BreadcrumbItem }
