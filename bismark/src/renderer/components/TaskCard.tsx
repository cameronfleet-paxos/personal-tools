import { Circle, CheckCircle2, Loader2, AlertCircle, Send } from 'lucide-react'
import type { TaskAssignment, Agent } from '@/shared/types'

interface TaskCardProps {
  assignment: TaskAssignment
  agent?: Agent
}

const statusIcons: Record<TaskAssignment['status'], React.ReactNode> = {
  pending: <Circle className="h-3 w-3 text-muted-foreground" />,
  sent: <Send className="h-3 w-3 text-blue-500" />,
  in_progress: <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  failed: <AlertCircle className="h-3 w-3 text-red-500" />,
}

const statusLabels: Record<TaskAssignment['status'], string> = {
  pending: 'Pending',
  sent: 'Sent',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
}

export function TaskCard({ assignment, agent }: TaskCardProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded border bg-card">
      {statusIcons[assignment.status]}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-muted-foreground truncate">
          {assignment.beadId}
        </div>
        {agent && (
          <div className="text-xs text-muted-foreground">
            {agent.name}
          </div>
        )}
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded ${
        assignment.status === 'completed' ? 'bg-green-500/20 text-green-500' :
        assignment.status === 'failed' ? 'bg-red-500/20 text-red-500' :
        assignment.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-500' :
        assignment.status === 'sent' ? 'bg-blue-500/20 text-blue-500' :
        'bg-muted text-muted-foreground'
      }`}>
        {statusLabels[assignment.status]}
      </span>
    </div>
  )
}
