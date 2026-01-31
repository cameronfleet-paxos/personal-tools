import { useState } from 'react'
import { ArrowLeft, Check, X, Loader2, Activity, GitBranch, GitPullRequest, Clock, CheckCircle2, AlertCircle, ExternalLink, GitCommit } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { TaskCard } from '@/renderer/components/TaskCard'
import type { Plan, TaskAssignment, Agent, PlanActivity } from '@/shared/types'

interface PlanDetailViewProps {
  plan: Plan
  activities: PlanActivity[]
  taskAssignments: TaskAssignment[]
  agents: Agent[]
  onBack: () => void
  onComplete: () => void
  onCancel: () => Promise<void>
}

const statusIcons: Record<Plan['status'], React.ReactNode> = {
  draft: <Clock className="h-3 w-3 text-muted-foreground" />,
  delegating: <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />,
  in_progress: <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />,
  ready_for_review: <CheckCircle2 className="h-3 w-3 text-purple-500" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  failed: <AlertCircle className="h-3 w-3 text-red-500" />,
}

const statusLabels: Record<Plan['status'], string> = {
  draft: 'Draft',
  delegating: 'Delegating',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  completed: 'Completed',
  failed: 'Failed',
}

const statusColors: Record<Plan['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  delegating: 'bg-blue-500/20 text-blue-500',
  in_progress: 'bg-yellow-500/20 text-yellow-500',
  ready_for_review: 'bg-purple-500/20 text-purple-500',
  completed: 'bg-green-500/20 text-green-500',
  failed: 'bg-red-500/20 text-red-500',
}

const activityIcons: Record<PlanActivity['type'], React.ReactNode> = {
  info: <span className="text-muted-foreground">○</span>,
  success: <span className="text-green-500">✓</span>,
  warning: <span className="text-yellow-500">⚠</span>,
  error: <span className="text-red-500">✕</span>,
}

const activityColors: Record<PlanActivity['type'], string> = {
  info: 'text-muted-foreground',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
}

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function PlanDetailView({
  plan,
  activities,
  taskAssignments,
  agents,
  onBack,
  onComplete,
  onCancel,
}: PlanDetailViewProps) {
  const [isCancelling, setIsCancelling] = useState(false)

  const handleCancel = async () => {
    setIsCancelling(true)
    await onCancel()
  }

  const getAgentById = (id: string) => agents.find((a) => a.id === id)
  const referenceAgent = plan.referenceAgentId ? getAgentById(plan.referenceAgentId) : null

  // Filter task assignments for this plan
  const planTasks = taskAssignments.filter((t) => {
    // Match tasks whose agent belongs to this plan
    const agent = getAgentById(t.agentId)
    return agent?.parentPlanId === plan.id
  })

  // Reverse activities for newest-first display
  const reversedActivities = [...activities].reverse()

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 p-3 border-b">
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          className="h-7 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-medium truncate flex-1">{plan.title}</h2>
      </div>

      {/* Plan info section */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${statusColors[plan.status]}`}>
            {statusIcons[plan.status]}
            {statusLabels[plan.status]}
          </span>
          {referenceAgent && (
            <span className="text-xs text-muted-foreground">
              Reference: {referenceAgent.name}
            </span>
          )}
        </div>

        {plan.description && (
          <p className="text-xs text-muted-foreground">{plan.description}</p>
        )}

        {/* Branch strategy badge */}
        <div className="flex items-center gap-2 text-xs">
          {plan.branchStrategy === 'feature_branch' ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">
              <GitBranch className="h-3 w-3" />
              Feature Branch
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-500">
              <GitPullRequest className="h-3 w-3" />
              Raise PRs
            </span>
          )}
          {plan.baseBranch && (
            <span className="text-muted-foreground">Base: {plan.baseBranch}</span>
          )}
        </div>

        {/* Worktree info */}
        {plan.worktrees && plan.worktrees.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            <span>{plan.worktrees.filter(w => w.status !== 'cleaned').length} worktree(s)</span>
          </div>
        )}

        {/* Action buttons */}
        {(plan.status === 'delegating' || plan.status === 'in_progress') && (
          <Button
            size="sm"
            variant="destructive"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" />
                Cancel
              </>
            )}
          </Button>
        )}

        {plan.status === 'ready_for_review' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onComplete}>
              <Check className="h-3 w-3 mr-1" />
              Mark Complete
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isCancelling}
              onClick={handleCancel}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Git Summary section */}
      {plan.gitSummary && (
        <div className="p-3 border-b">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Git Summary
          </h3>

          {/* Commits (feature_branch strategy) */}
          {plan.gitSummary.commits && plan.gitSummary.commits.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <GitCommit className="h-3 w-3" />
                <span>{plan.gitSummary.commits.length} commit(s)</span>
                {plan.featureBranch && (() => {
                  // Extract GitHub repo URL from the first commit's githubUrl
                  const firstCommit = plan.gitSummary.commits?.[0]
                  const repoUrl = firstCommit?.githubUrl?.replace(/\/commit\/[a-f0-9]+$/, '')
                  const branchUrl = repoUrl ? `${repoUrl}/tree/${plan.featureBranch}` : null

                  return branchUrl ? (
                    <button
                      onClick={() => window.electronAPI.openExternal(branchUrl)}
                      className="ml-1 flex items-center gap-0.5 hover:text-foreground"
                      title="View feature branch on GitHub"
                    >
                      <span>→ {plan.featureBranch}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  ) : (
                    <span className="ml-1">→ {plan.featureBranch}</span>
                  )
                })()}
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {plan.gitSummary.commits.map((commit) => (
                  <div key={commit.sha} className="text-xs flex items-start gap-1.5 p-1 hover:bg-muted/30 rounded">
                    <code className="text-muted-foreground font-mono shrink-0">{commit.shortSha}</code>
                    <span className="truncate flex-1">{commit.message}</span>
                    {commit.githubUrl && (
                      <button
                        onClick={() => window.electronAPI.openExternal(commit.githubUrl!)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="View on GitHub"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pull Requests (raise_prs strategy) */}
          {plan.gitSummary.pullRequests && plan.gitSummary.pullRequests.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <GitPullRequest className="h-3 w-3" />
                <span>{plan.gitSummary.pullRequests.length} PR(s)</span>
              </div>
              <div className="space-y-1">
                {plan.gitSummary.pullRequests.map((pr) => (
                  <div key={pr.number} className="text-xs flex items-center gap-2 p-1.5 border rounded hover:bg-muted/30">
                    <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                      pr.status === 'merged' ? 'bg-purple-500/20 text-purple-500' :
                      pr.status === 'open' ? 'bg-green-500/20 text-green-500' :
                      'bg-red-500/20 text-red-500'
                    }`}>
                      {pr.status}
                    </span>
                    <span className="text-muted-foreground">#{pr.number}</span>
                    <span className="truncate flex-1">{pr.title}</span>
                    <button
                      onClick={() => window.electronAPI.openExternal(pr.url)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="View PR on GitHub"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!plan.gitSummary.commits || plan.gitSummary.commits.length === 0) &&
           (!plan.gitSummary.pullRequests || plan.gitSummary.pullRequests.length === 0) && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No git activity yet
            </div>
          )}
        </div>
      )}

      {/* Tasks section */}
      {planTasks.length > 0 && (
        <div className="p-3 border-b">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Tasks ({planTasks.length})
          </h3>
          <div className="space-y-2">
            {planTasks.map((task) => (
              <TaskCard
                key={task.beadId}
                assignment={task}
                agent={getAgentById(task.agentId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Activity log section - fills remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span className="text-xs font-medium">Activity Log</span>
            {activities.length > 0 && (
              <span className="text-xs text-muted-foreground">({activities.length})</span>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No activity yet
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {reversedActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="px-3 py-1.5 text-xs hover:bg-muted/30"
                  title={activity.details || undefined}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-muted-foreground font-mono shrink-0">
                      {formatActivityTime(activity.timestamp)}
                    </span>
                    <span className="shrink-0">{activityIcons[activity.type]}</span>
                    <span className={activityColors[activity.type]}>
                      {activity.message}
                    </span>
                  </div>
                  {activity.details && (
                    <div className="ml-16 text-muted-foreground truncate">
                      {activity.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
