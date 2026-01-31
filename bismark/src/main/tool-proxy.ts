/**
 * Tool Proxy Server
 *
 * A local HTTP server that proxies sensitive tool operations for containerized agents.
 * Agents call this proxy instead of running tools directly, keeping tokens on the host.
 *
 * Security benefits:
 * - Tokens never enter containers
 * - Bismark controls what operations are allowed
 * - Can log/audit all sensitive operations
 * - Easy to add rate limiting or approval flows later
 */

import * as http from 'http'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

export interface ToolProxyConfig {
  port: number // Default: 9847
  tools: {
    gh: { enabled: boolean }
    // Future: slack, jira, etc.
  }
}

const DEFAULT_CONFIG: ToolProxyConfig = {
  port: 9847,
  tools: {
    gh: { enabled: true },
  },
}

interface ProxyRequest {
  args: string[]
  stdin?: string
}

interface ProxyResponse {
  success: boolean
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
}

// Event emitter for proxy activity logging
export const proxyEvents = new EventEmitter()

let server: http.Server | null = null
let currentConfig: ToolProxyConfig = DEFAULT_CONFIG

/**
 * Execute a command and return the result
 */
async function executeCommand(
  command: string,
  args: string[],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env: process.env, // Inherits tokens from host environment
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    if (stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      })
    })

    proc.on('error', (err) => {
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      })
    })
  })
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Send JSON response
 */
function sendJson(res: http.ServerResponse, status: number, data: ProxyResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/**
 * Handle gh CLI proxy requests
 */
async function handleGhRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subpath: string
): Promise<void> {
  if (!currentConfig.tools.gh.enabled) {
    sendJson(res, 403, { success: false, error: 'gh tool is disabled' })
    return
  }

  try {
    const body = (await parseBody(req)) as ProxyRequest

    // Build gh command based on subpath
    let args: string[] = []

    switch (subpath) {
      case '/pr/create':
        args = ['pr', 'create', ...body.args]
        break
      case '/pr/view':
        args = ['pr', 'view', ...body.args]
        break
      case '/pr/list':
        args = ['pr', 'list', ...body.args]
        break
      case '/issue/create':
        args = ['issue', 'create', ...body.args]
        break
      case '/issue/view':
        args = ['issue', 'view', ...body.args]
        break
      case '/api':
        // Raw API access - args should contain full gh api command
        args = ['api', ...body.args]
        break
      default:
        // Generic passthrough - use args directly
        args = body.args || []
    }

    // Log the operation
    proxyEvents.emit('gh', { subpath, args })

    const result = await executeCommand('gh', args, body.stdin)

    sendJson(res, 200, {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    })
  } catch (err) {
    sendJson(res, 400, {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

/**
 * Handle health check requests
 */
function handleHealthCheck(res: http.ServerResponse): void {
  sendJson(res, 200, { success: true, stdout: 'ok' })
}

/**
 * Main request handler
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = req.url || '/'
  const method = req.method || 'GET'

  // CORS headers for container access
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Route requests
  if (url === '/health' && method === 'GET') {
    handleHealthCheck(res)
  } else if (url.startsWith('/gh') && method === 'POST') {
    const subpath = url.substring(3) // Remove '/gh' prefix
    await handleGhRequest(req, res, subpath || '/')
  } else {
    sendJson(res, 404, { success: false, error: 'Not found' })
  }
}

/**
 * Start the tool proxy server
 */
export function startToolProxy(config: Partial<ToolProxyConfig> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    currentConfig = { ...DEFAULT_CONFIG, ...config }

    if (server) {
      console.log('[ToolProxy] Server already running')
      resolve()
      return
    }

    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error('[ToolProxy] Request error:', err)
        sendJson(res, 500, { success: false, error: 'Internal server error' })
      })
    })

    server.on('error', (err) => {
      console.error('[ToolProxy] Server error:', err)
      reject(err)
    })

    server.listen(currentConfig.port, '0.0.0.0', () => {
      console.log(`[ToolProxy] Server listening on port ${currentConfig.port}`)
      proxyEvents.emit('started', { port: currentConfig.port })
      resolve()
    })
  })
}

/**
 * Stop the tool proxy server
 */
export function stopToolProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }

    server.close(() => {
      console.log('[ToolProxy] Server stopped')
      server = null
      proxyEvents.emit('stopped')
      resolve()
    })
  })
}

/**
 * Get the proxy URL for containers to use
 */
export function getProxyUrl(): string {
  return `http://host.docker.internal:${currentConfig.port}`
}

/**
 * Check if proxy server is running
 */
export function isProxyRunning(): boolean {
  return server !== null
}

/**
 * Get current proxy configuration
 */
export function getProxyConfig(): ToolProxyConfig {
  return { ...currentConfig }
}
