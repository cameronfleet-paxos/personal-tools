import { useState, ReactNode, createContext, useContext } from 'react'
import { Button } from '@/renderer/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Repository } from '@/shared/types'

// Step identifiers
export type WizardStep = 'directory' | 'confirmation'

interface OnboardingWizardProps {
  onComplete: (selectedDirectory?: string, discoveredRepos?: Repository[]) => void
  onSkip?: () => void
  children?: ReactNode
}

interface WizardStepConfig {
  id: WizardStep
  title: string
  description: string
}

const steps: WizardStepConfig[] = [
  {
    id: 'directory',
    title: 'Select Repository Directory',
    description: 'Choose a directory to scan for git repositories',
  },
  {
    id: 'confirmation',
    title: 'Confirm Repositories',
    description: 'Review discovered repositories and create agents',
  },
]

// Wizard context to pass step state and control to child components
export interface WizardContextValue {
  currentStep: WizardStep
  canProceed: boolean
  setCanProceed: (canProceed: boolean) => void
  goToNextStep: () => void
  goToPreviousStep: () => void
  selectedDirectory: string | null
  setSelectedDirectory: (directory: string | null) => void
  discoveredRepos: Repository[]
  setDiscoveredRepos: (repos: Repository[]) => void
}

// Create context
const WizardContext = createContext<WizardContextValue | null>(null)

// Custom hook to use wizard context in step components
export function useWizardContext() {
  const context = useContext(WizardContext)
  if (!context) {
    throw new Error('useWizardContext must be used within OnboardingWizard')
  }
  return context
}

export function OnboardingWizard({ onComplete, onSkip, children }: OnboardingWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [canProceed, setCanProceed] = useState(false)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [discoveredRepos, setDiscoveredRepos] = useState<Repository[]>([])

  const currentStep = steps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  const handleNext = () => {
    if (isLastStep) {
      onComplete(selectedDirectory || undefined, discoveredRepos)
    } else {
      setCurrentStepIndex((prev) => prev + 1)
      setCanProceed(false)
    }
  }

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1)
      setCanProceed(true)
    }
  }

  const handleSkip = () => {
    if (onSkip) {
      onSkip()
    }
  }

  // Create context value to pass to child step components
  const contextValue: WizardContextValue = {
    currentStep: currentStep.id,
    canProceed,
    setCanProceed,
    goToNextStep: handleNext,
    goToPreviousStep: handleBack,
    selectedDirectory,
    setSelectedDirectory,
    discoveredRepos,
    setDiscoveredRepos,
  }

  return (
    <WizardContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to Bismarck</h1>
          <p className="text-muted-foreground">
            Let's set up your workspace by discovering your repositories
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index === currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : index < currentStepIndex
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-16 h-1 mx-2 transition-colors ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-card border rounded-lg p-8 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{currentStep.title}</h2>
            <p className="text-muted-foreground">{currentStep.description}</p>
          </div>

          {/* Step-specific content */}
          <div className="min-h-[300px]">
            {children ? (
              <div className="h-full">{children}</div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <p>Step content will be implemented by DirectoryStep and ConfirmationStep components</p>
                  <p className="text-sm mt-2">Current step: {currentStep.id}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div>
            {isFirstStep && onSkip && (
              <Button variant="ghost" onClick={handleSkip}>
                Skip Setup
              </Button>
            )}
            {!isFirstStep && (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <Button onClick={handleNext} disabled={!canProceed}>
              {isLastStep ? 'Complete Setup' : 'Next'}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Helper text */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>You can always add more repositories later from the main interface</p>
        </div>
        </div>
      </div>
    </WizardContext.Provider>
  )
}
