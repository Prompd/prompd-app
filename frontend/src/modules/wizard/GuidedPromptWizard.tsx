import { useState } from 'react'
import { WizardState, WizardStep } from '../types/wizard'
import PackageSearchStep from './steps/PackageSearchStep'
import { Package as PackageIcon, FileText, Check } from 'lucide-react'
import './wizard.css'

interface Props {
  initialText?: string
  onChange: (text: string, tabName?: string) => void
  onComplete?: (state: WizardState) => void
  theme?: 'light' | 'dark'
}

export default function GuidedPromptWizard({ initialText, onChange, onComplete, theme = 'dark' }: Props) {
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 'select-packages',
    selectedPackages: [],
    basePrompt: null,
    basePromptContent: null,
    sections: [],
    sectionOverrides: {},
    id: '',
    name: '',
    version: '1.0.0',
    contextFiles: []
  })

  const handleNext = () => {
    // Single-step wizard: select-packages -> complete (goes to Design View)
    const steps: WizardStep[] = ['select-packages', 'complete']
    const currentIndex = steps.indexOf(wizardState.currentStep)
    if (currentIndex < steps.length - 1) {
      setWizardState(prev => ({
        ...prev,
        currentStep: steps[currentIndex + 1]
      }))
    }
  }

  // Handle drag-and-drop of context files
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const contextFileData = e.dataTransfer.getData('application/x-prompd-context-file')
    if (contextFileData) {
      try {
        const { path } = JSON.parse(contextFileData)
        setWizardState(prev => ({
          ...prev,
          contextFiles: [...(prev.contextFiles || []), path]
        }))
        console.log('✓ Added context file to wizard:', path)
      } catch (err) {
        console.error('❌ Failed to add context file:', err)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div
      className="wizard-container"
      data-theme={theme}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="wizard-inner">
        {/* Header - matches DesignView title row */}
        <div className="wizard-header">
          <div className="wizard-title-row">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)' }}>
                Create New Prompt
              </h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                Build with package-based inheritance
              </span>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="wizard-steps">
            <StepIndicator
              icon={PackageIcon}
              label="Select Packages"
              active={wizardState.currentStep === 'select-packages'}
              completed={wizardState.selectedPackages.length > 0}
            />
            <div className="wizard-step-connector">
              <div
                className={`wizard-step-line ${wizardState.selectedPackages.length > 0 ? 'completed' : ''}`}
              />
            </div>
            <StepIndicator
              icon={FileText}
              label="Customize"
              active={wizardState.currentStep === 'complete'}
              completed={false}
            />
          </div>
        </div>

        {/* Form Section - card style like DesignView metadata */}
        <div className="wizard-form" data-hint-target="wizard-metadata">
          {/* Section Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border)'
          }}>
            <FileText size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Prompt Details</span>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontWeight: 400,
              fontStyle: 'italic'
            }}>
              Basic identification for your prompt
            </span>
          </div>

          {/* Prompt Name */}
          <div className="form-group">
            <label className="form-label">
              Prompt Name <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              value={wizardState.name}
              onChange={(e) => setWizardState(prev => ({
                ...prev,
                name: e.target.value,
                id: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
              }))}
              placeholder="e.g., Customer Support Assistant"
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">
              Description <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              className="input"
              value={wizardState.description || ''}
              onChange={(e) => setWizardState(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Briefly describe what this prompt does..."
              rows={2}
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>
        </div>

      {/* Step Content */}
      <div className="wizard-content">
        {wizardState.currentStep === 'select-packages' && (
          <div className="wizard-form" data-hint-target="wizard-packages">
            {/* Section Header - matches Prompt Details style */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--border)'
            }}>
              <PackageIcon size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Package Selection</span>
              <span style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontWeight: 400,
                fontStyle: 'italic'
              }}>
                Search and configure packages for your prompt
              </span>
            </div>
            <PackageSearchStep
              wizardState={wizardState}
            onUpdate={setWizardState}
            theme={theme}
            onNext={() => {
              // Generate initial .prmd file structure
              const basePrompt = wizardState.basePrompt

              // Build using: section from all selected packages
              let usingSection = ''
              if (wizardState.selectedPackages.length > 0) {
                const usingEntries = wizardState.selectedPackages.map(pkg => {
                  return `  - name: "${pkg.name}"
    prefix: "${pkg.prefix || '@pkg'}"`
                }).join('\n')
                usingSection = `using:\n${usingEntries}\n`
              }

              // Build inherits line if a base template is selected
              let inheritsLine = ''
              if (basePrompt) {
                const cleanBasePrompt = basePrompt.replace(/^"|"$/g, '')
                // Match pattern: @namespace/package@version/path/to/file.prmd
                // We need to find the last @ which separates version from package name
                const versionSeparatorIndex = cleanBasePrompt.indexOf('@', 1) // Start from 1 to skip initial @
                if (versionSeparatorIndex > 0) {
                  const packageName = cleanBasePrompt.substring(0, versionSeparatorIndex)
                  const afterVersion = cleanBasePrompt.substring(versionSeparatorIndex + 1)
                  const pathSeparatorIndex = afterVersion.indexOf('/')

                  if (pathSeparatorIndex > 0) {
                    const version = afterVersion.substring(0, pathSeparatorIndex)
                    const filePath = afterVersion.substring(pathSeparatorIndex + 1)
                    const fullPackageRef = `${packageName}@${version}`
                    const pkg = wizardState.selectedPackages.find(p => p.name === fullPackageRef)
                    const prefix = pkg?.prefix || '@pkg'
                    // Quote the path since it starts with @
                    inheritsLine = `inherits: "${prefix}/${filePath}"\n`
                  } else {
                    inheritsLine = `inherits: "${cleanBasePrompt}"\n`
                  }
                } else {
                  inheritsLine = `inherits: "${cleanBasePrompt}"\n`
                }
              }

              // Build description line if provided
              const descriptionLine = wizardState.description?.trim()
                ? `description: "${wizardState.description.trim()}"\n`
                : ''

              const generatedText = `---
id: "${wizardState.id || 'my-prompt'}"
name: "${wizardState.name || 'My Prompt'}"
${descriptionLine}version: "${wizardState.version || '1.0.0'}"
${usingSection}${inheritsLine}---

# System


# User

Add your content here...
`
              console.log('[Wizard] Generated .prmd content:', generatedText)
              console.log('[Wizard] Selected packages:', wizardState.selectedPackages)
              console.log('[Wizard] Base prompt:', wizardState.basePrompt)
              console.log('[Wizard] Wizard state at onNext:', wizardState)

              // Update tab name to match the id field
              const tabName = wizardState.id ? `${wizardState.id}.prmd` : 'untitled.prmd'

              onChange(generatedText, tabName)
              const completedState = { ...wizardState, currentStep: 'complete' as WizardStep }
              setWizardState(completedState)
              setTimeout(() => onComplete?.(completedState), 500)
            }}
          />
          </div>
        )}
        {wizardState.currentStep === 'complete' && (
          <div className="wizard-success">
            <div className="wizard-success-icon">
              <Check size={32} />
            </div>
            <h2 className="wizard-success-title">Prompt Created Successfully!</h2>
            <p className="wizard-success-message">Switching to Design View...</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function StepIndicator({
  icon: Icon,
  label,
  active,
  completed
}: {
  icon: any
  label: string
  active: boolean
  completed: boolean
}) {
  return (
    <div className={`wizard-step ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}>
      <div className="wizard-step-icon">
        {completed ? <Check size={16} /> : <Icon size={16} />}
      </div>
      <span className="wizard-step-label">{label}</span>
    </div>
  )
}
