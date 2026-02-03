"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Clock,
  FolderOpen,
  User,
  Bot,
  Wrench,
  Code,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { SessionConversation, ConversationMessage, ContentBlock } from "@/types/settings";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/store";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") {
    return content;
  }

  const textBlocks = content.filter((block) => block.type === "text" && block.text);
  return textBlocks.map((block) => block.text).join("\n");
}

function extractToolCalls(content: string | ContentBlock[]): ContentBlock[] {
  if (typeof content === "string") {
    return [];
  }
  return content.filter((block) => block.type === "tool_use");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTokens(text: string, tokens: Array<{ fullPattern: string; redactedValue: string }>, showUnredacted: boolean): string {
  let result = text;

  tokens.forEach(token => {
    const pattern = token.fullPattern;
    const replacement = showUnredacted
      ? `<mark class="bg-red-500/20 dark:bg-red-900/30 font-mono px-1 rounded">${pattern}</mark>`
      : `<mark class="bg-red-500/20 dark:bg-red-900/30 font-mono px-1 rounded">${token.redactedValue}</mark>`;

    // Use regex to replace all occurrences
    try {
      result = result.replace(new RegExp(escapeRegex(pattern), 'g'), replacement);
    } catch {
      // If regex fails, skip this token
    }
  });

  return result;
}

/**
 * Extract a human-readable summary of what a tool call is doing
 * @param full - if true, return full content; if false, return truncated preview
 */
function getToolSummary(tool: ContentBlock, full: boolean = false): string | null {
  const input = tool.input;
  if (!input) return null;

  const name = tool.name || "";
  const limit = full ? 500 : 100;

  // File operations - show full path when expanded
  if (name === "Read" && input.file_path) {
    const filePath = String(input.file_path);
    if (full) return filePath;
    const fileName = filePath.split("/").pop() || filePath;
    return fileName;
  }

  if (name === "Write" && input.file_path) {
    const filePath = String(input.file_path);
    if (full) return filePath;
    const fileName = filePath.split("/").pop() || filePath;
    return fileName;
  }

  if (name === "Edit" && input.file_path) {
    const filePath = String(input.file_path);
    if (full) return filePath;
    const fileName = filePath.split("/").pop() || filePath;
    return fileName;
  }

  // Bash commands
  if (name === "Bash" && input.command) {
    const cmd = String(input.command);
    return cmd.length > limit ? cmd.slice(0, limit) + "..." : cmd;
  }

  // Search operations
  if (name === "Grep" && input.pattern) {
    const pattern = String(input.pattern);
    const path = input.path ? (full ? ` in ${String(input.path)}` : ` in ${String(input.path).split("/").pop()}`) : "";
    return `"${pattern}"${path}`;
  }

  if (name === "Glob" && input.pattern) {
    const pattern = String(input.pattern);
    const path = input.path ? (full ? ` in ${String(input.path)}` : ` in ${String(input.path).split("/").pop()}`) : "";
    return `${pattern}${path}`;
  }

  // Task/Agent
  if (name === "Task") {
    if (input.prompt) {
      const prompt = String(input.prompt);
      return prompt.length > limit ? prompt.slice(0, limit) + "..." : prompt;
    }
    if (input.description) {
      const desc = String(input.description);
      return desc.length > limit ? desc.slice(0, limit) + "..." : desc;
    }
  }

  // WebFetch
  if (name === "WebFetch" && input.url) {
    const urlStr = String(input.url);
    if (full) return urlStr;
    try {
      const url = new URL(urlStr);
      return url.hostname + url.pathname.slice(0, 30);
    } catch {
      return urlStr.slice(0, 50);
    }
  }

  // WebSearch
  if (name === "WebSearch" && input.query) {
    const query = String(input.query);
    return query.length > limit ? query.slice(0, limit) + "..." : query;
  }

  return null;
}

function ToolCallBadge({ tool }: { tool: ContentBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fullSummary = getToolSummary(tool, true);
  const shortSummary = getToolSummary(tool, false);

  const isLong = fullSummary && shortSummary && fullSummary.length > shortSummary.length;
  const displaySummary = isExpanded ? fullSummary : shortSummary;

  return (
    <div
      className={cn(
        "flex items-start gap-1.5 text-xs font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-md px-2 py-1.5",
        isLong && "cursor-pointer hover:bg-amber-500/20"
      )}
      onClick={isLong ? () => setIsExpanded(!isExpanded) : undefined}
    >
      <Wrench className="h-3 w-3 flex-shrink-0 mt-0.5" />
      <span className="font-semibold flex-shrink-0">{tool.name}</span>
      {displaySummary && (
        <>
          <span className="text-amber-600/50 dark:text-amber-500/50 flex-shrink-0">·</span>
          <span className="text-amber-600 dark:text-amber-300 break-all">
            {displaySummary}
          </span>
          {isLong && !isExpanded && (
            <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-amber-500/50" />
          )}
          {isLong && isExpanded && (
            <ChevronDown className="h-3 w-3 flex-shrink-0 mt-0.5 text-amber-500/50" />
          )}
        </>
      )}
    </div>
  );
}

function ToolResultMessage({ message }: { message: ConversationMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const content = typeof message.content === "string" ? message.content : "";

  // Extract a preview - just show tool name if possible
  const toolMatch = content.match(/<tool_result tool_use_id="[^"]*"[^>]*>/);
  const preview = toolMatch ? "Tool Result" : "Tool Output";

  // Clean content for display - remove XML tags
  const cleanContent = content
    .replace(/<\/?tool_result[^>]*>/g, "")
    .replace(/<\/?system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();

  // Truncate if very long
  const displayContent = cleanContent.length > 2000
    ? cleanContent.slice(0, 2000) + "\n... (truncated)"
    : cleanContent;

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-500/10 text-slate-600 dark:text-slate-400">
        <Code className="h-4 w-4" />
      </div>
      <div className="flex-1 max-w-[85%]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium">{preview}</span>
        </button>
        {isExpanded && (
          <div className="mt-2 rounded-lg px-4 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <pre className="text-xs whitespace-pre-wrap break-words font-mono text-slate-700 dark:text-slate-300 max-h-96 overflow-y-auto">
              {displayContent}
            </pre>
          </div>
        )}
        <span className="text-xs text-muted-foreground px-1 mt-1 block">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  sessionTokens,
  showUnredactedTokens
}: {
  message: ConversationMessage;
  sessionTokens: Array<{ fullPattern: string; redactedValue: string }>;
  showUnredactedTokens: boolean;
}) {
  const isUser = message.type === "user";
  const isToolResult = message.subtype === "tool_result";

  // Handle tool results separately
  if (isToolResult) {
    return <ToolResultMessage message={message} />;
  }

  const textContent = extractTextContent(message.content);
  const toolCalls = extractToolCalls(message.content);

  // Skip empty messages
  if (!textContent && toolCalls.length === 0) {
    return null;
  }

  // Highlight tokens in text content
  const highlightedContent = sessionTokens.length > 0
    ? highlightTokens(textContent, sessionTokens, showUnredactedTokens)
    : textContent;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "flex-1 max-w-[85%] space-y-2",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-lg px-4 py-2",
            isUser
              ? "bg-blue-500/10 text-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {textContent && sessionTokens.length > 0 && (
            <div
              className="text-sm whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
          )}
          {textContent && sessionTokens.length === 0 && (
            <p className="text-sm whitespace-pre-wrap break-words">{textContent}</p>
          )}
          {toolCalls.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2">
              {toolCalls.map((tool, idx) => (
                <ToolCallBadge key={idx} tool={tool} />
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground px-1">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

export default function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getTokensBySession } = useSettingsStore();

  const sessionId = params.sessionId as string;
  const projectPath = searchParams.get("project");

  const [conversation, setConversation] = useState<SessionConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnredactedTokens, setShowUnredactedTokens] = useState(false);

  // Get tokens for this session from security scan results
  const sessionTokens = getTokensBySession(sessionId).map(t => ({
    fullPattern: t.fullPattern,
    redactedValue: t.redactedValue,
  }));

  useEffect(() => {
    async function loadConversation() {
      setLoading(true);
      setError(null);

      try {
        const url = projectPath
          ? `/api/discussions/${sessionId}?project=${encodeURIComponent(projectPath)}`
          : `/api/discussions/${sessionId}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to load conversation");
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }

        setConversation(data.conversation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadConversation();
  }, [sessionId, projectPath]);

const [copied, setCopied] = useState(false);

  const handleBack = () => {
    router.push("/discussions");
  };

  const handleCopy = async () => {
    if (!conversation) return;

    const lines: string[] = [
      `# ${conversation.projectName} - Claude Code Discussion`,
      `Session: ${conversation.sessionId}`,
      `---`,
      "",
    ];

    for (const message of conversation.messages) {
      const timestamp = formatTimestamp(message.timestamp);
      const role = message.type === "user"
        ? (message.subtype === "tool_result" ? "Tool Result" : "User")
        : "Assistant";

      lines.push(`## ${role} [${timestamp}]`);
      lines.push("");

      if (typeof message.content === "string") {
        lines.push(message.content);
      } else {
        // Extract text content
        const textBlocks = message.content.filter((b) => b.type === "text" && b.text);
        for (const block of textBlocks) {
          if (block.text) lines.push(block.text);
        }

        // List tool calls
        const toolCalls = message.content.filter((b) => b.type === "tool_use");
        if (toolCalls.length > 0) {
          lines.push("");
          lines.push("**Tools used:**");
          for (const tool of toolCalls) {
            const summary = getToolSummary(tool, false);
            lines.push(`- ${tool.name}${summary ? `: ${summary}` : ""}`);
          }
        }
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    }

    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get first message timestamp for header
  const firstMessageTime = conversation?.messages[0]?.timestamp;
  const headerTime = firstMessageTime ? new Date(firstMessageTime).getTime() : Date.now();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"
              >
                <FolderOpen className="h-3 w-3 mr-1" />
                {conversation?.projectName || "Loading..."}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatFullTimestamp(headerTime)}
              </span>
            </div>
          </div>
          {conversation && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={copied}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Security Warning Banner */}
          {sessionTokens.length > 0 && !loading && !error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Warning</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {sessionTokens.length} credential{sessionTokens.length === 1 ? '' : 's'} detected in this conversation.
                </span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setShowUnredactedTokens(!showUnredactedTokens)}
                  className="h-auto p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  {showUnredactedTokens ? 'Hide' : 'Show'} full values
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" onClick={handleBack} className="mt-4">
                Go Back
              </Button>
            </div>
          ) : conversation?.messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No messages in this conversation
            </div>
          ) : (
            conversation?.messages.map((message) => (
              <MessageBubble
                key={message.uuid}
                message={message}
                sessionTokens={sessionTokens}
                showUnredactedTokens={showUnredactedTokens}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
