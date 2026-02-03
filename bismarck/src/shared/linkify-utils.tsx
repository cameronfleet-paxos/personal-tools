/**
 * Utility functions for detecting and rendering clickable links in text
 */

import React from 'react'

// URL regex - matches http(s) URLs
const URL_REGEX = /https?:\/\/[^\s<>]+[^\s<>.,;:!?'")\]]/gi

// File path regex - matches common file path patterns
// Matches: /path/to/file.ext, ./relative/path.ext, path/file.ext:123
const FILE_PATH_REGEX = /(?:^|\s)((?:\.?\.?\/)?[\w\-./]+\.[\w]+(?::\d+)?)/g

export interface LinkifyOptions {
  onFileClick?: (path: string) => void
  onUrlClick?: (url: string) => void
}

/**
 * Convert text with URLs and file paths to React elements with clickable links
 */
export function linkifyText(
  text: string,
  options: LinkifyOptions = {}
): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  // First, find all URLs and file paths with their positions
  interface Match {
    type: 'url' | 'file'
    value: string
    start: number
    end: number
  }

  const matches: Match[] = []

  // Find URLs
  const urlMatches = text.matchAll(URL_REGEX)
  for (const match of urlMatches) {
    if (match.index !== undefined) {
      matches.push({
        type: 'url',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }

  // Find file paths
  const fileMatches = text.matchAll(FILE_PATH_REGEX)
  for (const match of fileMatches) {
    if (match.index !== undefined && match[1]) {
      const start = match.index + match[0].indexOf(match[1])
      matches.push({
        type: 'file',
        value: match[1],
        start,
        end: start + match[1].length,
      })
    }
  }

  // Sort matches by position and remove overlaps
  matches.sort((a, b) => a.start - b.start)
  const filteredMatches: Match[] = []
  for (const match of matches) {
    // Skip if this match overlaps with previous match
    if (
      filteredMatches.length === 0 ||
      match.start >= filteredMatches[filteredMatches.length - 1].end
    ) {
      filteredMatches.push(match)
    }
  }

  // Build React nodes with text and links
  for (let i = 0; i < filteredMatches.length; i++) {
    const match = filteredMatches[i]

    // Add text before this match
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start))
    }

    // Add the link
    if (match.type === 'url') {
      parts.push(
        <a
          key={`url-${i}`}
          href={match.value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
          onClick={(e) => {
            e.preventDefault()
            if (options.onUrlClick) {
              options.onUrlClick(match.value)
            } else {
              window.electronAPI?.openExternal(match.value)
            }
          }}
        >
          {match.value}
        </a>
      )
    } else {
      parts.push(
        <button
          key={`file-${i}`}
          className="text-green-400 hover:text-green-300 underline cursor-pointer bg-transparent border-0 p-0 font-inherit"
          onClick={() => {
            if (options.onFileClick) {
              options.onFileClick(match.value)
            }
          }}
        >
          {match.value}
        </button>
      )
    }

    lastIndex = match.end
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}
