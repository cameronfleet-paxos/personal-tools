import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  separator?: React.ReactNode
  className?: string
}

export function Breadcrumb({ items, separator, className }: BreadcrumbProps) {
  const defaultSeparator = <ChevronRight className="h-4 w-4 text-muted-foreground" />
  const sep = separator !== undefined ? separator : defaultSeparator

  return (
    <nav aria-label="breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center space-x-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <li key={index} className="flex items-center space-x-2">
              {item.onClick ? (
                <button
                  onClick={item.onClick}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground",
                    isLast
                      ? "font-medium text-foreground pointer-events-none"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </button>
              ) : item.href ? (
                <a
                  href={item.href}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground",
                    isLast
                      ? "font-medium text-foreground pointer-events-none"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </a>
              ) : (
                <span
                  className={cn(
                    "text-sm",
                    isLast
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <span className="flex items-center">{sep}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
