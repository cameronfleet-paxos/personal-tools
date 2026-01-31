import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { PlanCard } from '@/renderer/components/PlanCard'
import { PlanDetailView } from '@/renderer/components/PlanDetailView'
import type { Plan, TaskAssignment, Agent, PlanActivity } from '@/shared/types'

interface PlanSidebarProps {
  open: boolean
  onClose: () => void
  plans: Plan[]
  taskAssignments: TaskAssignment[]
  planActivities: Map<string, PlanActivity[]>
  agents: Agent[]
  activePlanId: string | null
  onCreatePlan: () => void
  onSelectPlan: (planId: string | null) => void
  onExecutePlan: (planId: string, referenceAgentId: string) => void
  onCancelPlan: (planId: string) => Promise<void>
  onCompletePlan: (planId: string) => void
}

export function PlanSidebar({
  open,
  onClose,
  plans,
  taskAssignments,
  planActivities,
  agents,
  activePlanId,
  onCreatePlan,
  onSelectPlan,
  onExecutePlan,
  onCancelPlan,
  onCompletePlan,
}: PlanSidebarProps) {
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null)

  if (!open) return null

  // Find the plan being viewed in detail
  const detailPlan = detailPlanId ? plans.find((p) => p.id === detailPlanId) : null

  // If viewing a plan detail, show the detail view
  if (detailPlan) {
    return (
      <aside className="w-[360px] border-l flex flex-col bg-background">
        <PlanDetailView
          plan={detailPlan}
          activities={planActivities.get(detailPlan.id) || []}
          taskAssignments={taskAssignments}
          agents={agents}
          onBack={() => setDetailPlanId(null)}
          onComplete={() => {
            onCompletePlan(detailPlan.id)
            setDetailPlanId(null)
          }}
          onCancel={async () => {
            await onCancelPlan(detailPlan.id)
            setDetailPlanId(null)
          }}
        />
      </aside>
    )
  }

  const activePlans = plans.filter(
    (p) => p.status === 'delegating' || p.status === 'in_progress' || p.status === 'ready_for_review'
  )
  const draftPlans = plans.filter((p) => p.status === 'draft')
  const completedPlans = plans.filter(
    (p) => p.status === 'completed' || p.status === 'failed'
  )

  return (
    <aside className="w-[360px] border-l flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h2 className="font-medium">Plans</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onCreatePlan}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {plans.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No plans yet</p>
            <p className="text-xs mt-1">
              Create a plan to coordinate your agents
            </p>
          </div>
        ) : (
          <>
            {activePlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active ({activePlans.length})
                </h3>
                {activePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    agents={agents}
                    taskAssignments={taskAssignments}
                    activities={planActivities.get(plan.id) || []}
                    isActive={activePlanId === plan.id}
                    onExecute={(leaderId) => onExecutePlan(plan.id, leaderId)}
                    onCancel={() => onCancelPlan(plan.id)}
                    onComplete={() => onCompletePlan(plan.id)}
                    onClick={() => onSelectPlan(activePlanId === plan.id ? null : plan.id)}
                    onExpand={() => setDetailPlanId(plan.id)}
                  />
                ))}
              </div>
            )}

            {draftPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Drafts ({draftPlans.length})
                </h3>
                {draftPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    agents={agents}
                    taskAssignments={taskAssignments}
                    activities={planActivities.get(plan.id) || []}
                    isActive={activePlanId === plan.id}
                    onExecute={(leaderId) => onExecutePlan(plan.id, leaderId)}
                    onCancel={() => onCancelPlan(plan.id)}
                    onComplete={() => onCompletePlan(plan.id)}
                    onClick={() => onSelectPlan(activePlanId === plan.id ? null : plan.id)}
                    onExpand={() => setDetailPlanId(plan.id)}
                  />
                ))}
              </div>
            )}

            {completedPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Completed ({completedPlans.length})
                </h3>
                {completedPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    agents={agents}
                    taskAssignments={taskAssignments}
                    activities={planActivities.get(plan.id) || []}
                    isActive={activePlanId === plan.id}
                    onExecute={(leaderId) => onExecutePlan(plan.id, leaderId)}
                    onCancel={() => onCancelPlan(plan.id)}
                    onComplete={() => onCompletePlan(plan.id)}
                    onClick={() => onSelectPlan(activePlanId === plan.id ? null : plan.id)}
                    onExpand={() => setDetailPlanId(plan.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
