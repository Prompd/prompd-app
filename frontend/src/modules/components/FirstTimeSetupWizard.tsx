import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Key,
  Sparkles,
  FileText,
  MessageSquare,
  Code,
  Mail,
  PenTool,
  BarChart3,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ExternalLink,
  Plus,
  Loader2
} from 'lucide-react'
import { configService } from '../services/configService'
import { localExecutor } from '../services/localExecutor'
import { KNOWN_PROVIDERS } from '../services/providers/types'
import { useUIStore } from '../../stores/uiStore'
import {
  isOnboardingComplete,
  isWizardDismissed,
  markOnboardingComplete,
  dismissWizard,
  resetOnboardingState
} from '../services/onboardingService'

/**
 * Template definition for starter prompts
 */
interface PromptTemplate {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  content: string
}

/**
 * Provider option for API key configuration
 */
interface ProviderOption {
  id: string
  name: string
  keyPrefix?: string
  consoleUrl?: string
  isLocal?: boolean
}

interface FirstTimeSetupWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (result: { template?: PromptTemplate; generatedContent?: string; filename?: string }) => void
  theme: 'light' | 'dark'
}

type WizardStep = 'welcome' | 'api-keys' | 'create-prompt'
type CreateMode = 'template' | 'generate'

/**
 * Hardcoded prompt templates for quick start
 * Parameters use list format: - name: param_name
 */
const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'chat-assistant',
    name: 'Chat Assistant',
    description: 'Conversational AI for questions and discussions',
    icon: <MessageSquare size={24} />,
    content: `---
id: chat-assistant
name: Chat Assistant
description: A friendly conversational AI assistant
version: 1.0.0
model: gpt-4o
parameters:
  - name: topic
    type: string
    description: The topic or context for the conversation
    default: general
---

# System
You are a helpful, friendly, and knowledgeable AI assistant. You engage in natural conversation while providing accurate and useful information.

Key traits:
- Conversational and approachable tone
- Clear and concise explanations
- Ask clarifying questions when needed
- Admit when you're uncertain about something

# User
{{topic}}
`
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Review code for bugs and best practices',
    icon: <Code size={24} />,
    content: `---
id: code-reviewer
name: Code Reviewer
description: Analyzes code for quality, bugs, and best practices
version: 1.0.0
model: gpt-4o
parameters:
  - name: code
    type: string
    description: The code to review
    required: true
  - name: language
    type: string
    description: Programming language
    default: auto-detect
  - name: focus
    type: string
    description: Areas to focus on
    enum: [bugs, performance, security, style, all]
    default: all
---

# System
You are an expert code reviewer with deep knowledge of software engineering best practices. Analyze the provided code and give constructive feedback.

Your review should cover:
1. **Bugs & Issues**: Identify potential bugs, edge cases, or logic errors
2. **Best Practices**: Suggest improvements following language conventions
3. **Performance**: Note any performance concerns or optimizations
4. **Security**: Flag any security vulnerabilities
5. **Readability**: Suggest improvements for code clarity

Format your response with clear sections and specific line references when applicable.

# User
Please review this {{language}} code, focusing on {{focus}}:

\`\`\`
{{code}}
\`\`\`
`
  },
  {
    id: 'writing-helper',
    name: 'Writing Helper',
    description: 'Improve, edit, and enhance your writing',
    icon: <PenTool size={24} />,
    content: `---
id: writing-helper
name: Writing Helper
description: Helps improve and polish written content
version: 1.0.0
model: gpt-4o
parameters:
  - name: content
    type: string
    description: The text to improve
    required: true
  - name: style
    type: string
    description: Target writing style
    enum: [professional, casual, academic, creative, concise]
    default: professional
  - name: action
    type: string
    description: What to do with the content
    enum: [improve, proofread, shorten, expand, rewrite]
    default: improve
---

# System
You are a skilled editor and writing coach. Help users improve their writing while maintaining their voice and intent.

Guidelines:
- Preserve the original meaning and key points
- Match the requested style appropriately
- Explain significant changes you make
- Offer alternative phrasings when helpful

# User
Please {{action}} this text in a {{style}} style:

{{content}}
`
  },
  {
    id: 'email-composer',
    name: 'Email Composer',
    description: 'Draft professional emails quickly',
    icon: <Mail size={24} />,
    content: `---
id: email-composer
name: Email Composer
description: Drafts professional emails based on your needs
version: 1.0.0
model: gpt-4o
parameters:
  - name: purpose
    type: string
    description: What the email is about
    required: true
  - name: recipient
    type: string
    description: Who you're writing to
    default: colleague
  - name: tone
    type: string
    description: Email tone
    enum: [formal, friendly, urgent, apologetic, thankful]
    default: friendly
  - name: key_points
    type: string
    description: Main points to include
---

# System
You are an expert at composing clear, effective emails. Draft emails that are:
- Appropriately toned for the recipient and situation
- Clear and actionable
- Professional yet personable
- Concise but complete

Include a subject line suggestion.

# User
Write an email to my {{recipient}} about: {{purpose}}

Tone: {{tone}}
{% if key_points %}
Key points to include: {{key_points}}
{% endif %}
`
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyze data and generate insights',
    icon: <BarChart3 size={24} />,
    content: `---
id: data-analyst
name: Data Analyst
description: Analyzes data and provides actionable insights
version: 1.0.0
model: gpt-4o
parameters:
  - name: data
    type: string
    description: The data to analyze (CSV, JSON, or description)
    required: true
  - name: question
    type: string
    description: Specific question or analysis goal
  - name: output_format
    type: string
    description: How to format the analysis
    enum: [summary, detailed, bullet-points, report]
    default: summary
---

# System
You are a data analyst expert. Analyze the provided data and extract meaningful insights.

Your analysis should:
1. Summarize key patterns and trends
2. Highlight notable outliers or anomalies
3. Provide actionable recommendations
4. Use clear visualizations descriptions when helpful
5. Quantify findings with specific numbers

# User
{% if question %}
Analyze this data to answer: {{question}}
{% else %}
Provide a comprehensive analysis of this data:
{% endif %}

\`\`\`
{{data}}
\`\`\`

Format: {{output_format}}
`
  },
  {
    id: 'custom',
    name: 'Start from Scratch',
    description: 'Create your own custom prompt',
    icon: <FileText size={24} />,
    content: `---
id: my-prompt
name: My Custom Prompt
description: A custom prompt
version: 1.0.0
---

# System
[Describe how the AI should behave]

# User
[Your prompt here]
`
  }
]

/**
 * Get available providers from the known providers list
 */
function getAvailableProviders(): ProviderOption[] {
  const providers: ProviderOption[] = []

  for (const [id, config] of Object.entries(KNOWN_PROVIDERS)) {
    providers.push({
      id,
      name: config.displayName,
      keyPrefix: config.keyPrefix,
      consoleUrl: config.consoleUrl,
      isLocal: config.isLocal
    })
  }

  return providers
}

export function FirstTimeSetupWizard({ isOpen, onClose, onComplete, theme }: FirstTimeSetupWizardProps) {
  // Hook for refreshing providers after API key save
  const refreshLLMProviders = useUIStore(state => state.refreshLLMProviders)

  // Current wizard step
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')

  // API key configuration state
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [keySaveSuccess, setKeySaveSuccess] = useState(false)
  const [keySaveError, setKeySaveError] = useState<string | null>(null)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])

  // Custom provider state
  const [showCustomProvider, setShowCustomProvider] = useState(false)
  const [customProviderId, setCustomProviderId] = useState('')
  const [customProviderName, setCustomProviderName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')

  // Prompt creation state
  const [createMode, setCreateMode] = useState<CreateMode>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [promptDescription, setPromptDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const [generatedFilename, setGeneratedFilename] = useState<string>('')
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Don't show again checkbox
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    successBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    successBorder: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    accent: '#8b5cf6'
  }

  const availableProviders = getAvailableProviders()

  // Load configured providers on mount
  useEffect(() => {
    async function loadConfiguredProviders() {
      try {
        const configured: string[] = []
        for (const provider of availableProviders) {
          if (provider.isLocal) {
            // Local providers don't need API keys
            continue
          }
          const key = await configService.getApiKey(provider.id)
          if (key) {
            configured.push(provider.id)
          }
        }
        setConfiguredProviders(configured)

        // If user already has API keys configured, skip to prompt creation
        if (configured.length > 0) {
          setCurrentStep('create-prompt')
        }
      } catch (error) {
        console.error('[FirstTimeSetupWizard] Failed to load configured providers:', error)
      }
    }

    if (isOpen) {
      loadConfiguredProviders()
    }
  }, [isOpen])

  // Handle saving API key
  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setKeySaveError('Please enter an API key')
      return
    }

    const providerId = showCustomProvider ? customProviderId.trim().toLowerCase().replace(/\s+/g, '-') : selectedProvider

    if (!providerId) {
      setKeySaveError('Please select a provider')
      return
    }

    if (showCustomProvider && (!customProviderName.trim() || !customBaseUrl.trim())) {
      setKeySaveError('Please fill in all custom provider fields')
      return
    }

    setIsSavingKey(true)
    setKeySaveError(null)
    setKeySaveSuccess(false)

    try {
      // For custom providers, we need to save the provider config first
      if (showCustomProvider) {
        const config = await configService.getConfig()
        config.custom_providers = config.custom_providers || {}
        config.custom_providers[providerId] = {
          base_url: customBaseUrl.trim(),
          type: 'openai-compatible',
          enabled: true
        }
        await configService.saveConfig(config, 'global')
      }

      // Save the API key
      const success = await configService.setApiKey(providerId, apiKey.trim())

      if (success) {
        setKeySaveSuccess(true)
        setConfiguredProviders(prev => [...prev, providerId])

        // Refresh the provider list in the header so dropdown shows correctly
        // Pass a null token getter since wizard runs in Electron local mode
        try {
          await refreshLLMProviders(async () => null)
        } catch (refreshError) {
          console.warn('Failed to refresh providers after API key save:', refreshError)
        }

        // Reset form
        setApiKey('')
        setSelectedProvider('')
        setShowCustomProvider(false)
        setCustomProviderId('')
        setCustomProviderName('')
        setCustomBaseUrl('')

        // Auto-advance after a short delay
        setTimeout(() => {
          setKeySaveSuccess(false)
        }, 2000)
      } else {
        setKeySaveError('Failed to save API key. Please try again.')
      }
    } catch (error) {
      setKeySaveError(error instanceof Error ? error.message : 'Failed to save API key')
    } finally {
      setIsSavingKey(false)
    }
  }

  // Generate a prompt name from description
  const generatePromptName = (description: string): string => {
    // Extract key words and create a slug-style name
    const words = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'that', 'with', 'this'].includes(w))
      .slice(0, 3)

    if (words.length === 0) {
      return 'my-prompt'
    }

    return words.join('-')
  }

  // Handle generating a prompt from description
  const handleGeneratePrompt = async () => {
    if (!promptDescription.trim()) {
      setGenerateError('Please describe what you want your prompt to do')
      return
    }

    if (configuredProviders.length === 0) {
      setGenerateError('Please configure an API key first to generate prompts')
      return
    }

    setIsGenerating(true)
    setGenerateError(null)
    setGeneratedContent(null)

    try {
      // Get the first configured provider
      const provider = configuredProviders[0]

      // Check if we can execute locally
      const canExecute = await localExecutor.canExecuteLocally(provider)
      if (!canExecute) {
        setGenerateError('Cannot execute locally. Please ensure your API key is configured correctly.')
        setIsGenerating(false)
        return
      }

      // Get available models for the provider
      const models = localExecutor.getModelsForProvider(provider)
      const model = models[0]?.id || (provider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022')

      const systemPrompt = `You are an expert at creating Prompd (.prmd) prompt files. Prompd is a structured format for AI prompts with YAML frontmatter and markdown body.

A .prmd file has this exact structure:

\`\`\`
---
id: slug-style-identifier
name: Human Readable Name
description: Brief description of what this prompt does
version: 1.0.0
model: gpt-4o
parameters:
  - name: param_name
    type: string
    description: What this parameter is for
    required: true
  - name: another_param
    type: string
    description: Another parameter
    default: default_value
    enum: [option1, option2, option3]
---

# System
Instructions for how the AI should behave.

# User
The user's prompt with {{param_name}} placeholders.
\`\`\`

CRITICAL RULES:
1. Parameters MUST be a YAML list with "- name:" format, NOT an object/map
2. Output ONLY the raw .prmd file content starting with ---
3. Do NOT wrap the output in markdown code blocks
4. Do NOT add any explanation before or after
5. The file must start with exactly --- and end with the User section content
6. Use Nunjucks template syntax for control flow: {% if var %}, {% else %}, {% endif %}, {% for item in list %}, {% endfor %}. Variable output uses {{var}}. Do NOT use Handlebars syntax ({{#if}}, {{/if}}, {{#each}}, {{/each}})`

      const userPrompt = `Create a .prmd prompt file for: ${promptDescription}

Remember: Output ONLY the raw .prmd content starting with --- (no code blocks, no explanations).`

      const result = await localExecutor.execute({
        provider,
        model,
        prompt: userPrompt,
        systemPrompt,
        maxTokens: 2000,
        temperature: 0.7
      })

      if (result.success && result.response) {
        let content = result.response.trim()

        // Remove any leading text before the first ---
        const firstFrontmatterIndex = content.indexOf('---')
        if (firstFrontmatterIndex > 0) {
          content = content.substring(firstFrontmatterIndex)
        }

        // Handle case where LLM wraps in code blocks (```yaml or ```)
        // This regex handles: ```yaml\n---...\n``` or ```\n---...\n```
        const codeBlockMatch = content.match(/```(?:yaml|prmd|markdown)?\s*\n?(---[\s\S]*?---[\s\S]*?)```/i)
        if (codeBlockMatch) {
          content = codeBlockMatch[1].trim()
        } else {
          // Also try simpler pattern for just extracting from code blocks
          const simpleCodeBlockMatch = content.match(/```(?:yaml|prmd|markdown)?\s*\n?([\s\S]*?)```/i)
          if (simpleCodeBlockMatch) {
            content = simpleCodeBlockMatch[1].trim()
          }
        }

        // Remove any remaining ``` markers
        content = content.replace(/^```(?:yaml|prmd|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')

        // Ensure it starts with ---
        if (!content.startsWith('---')) {
          content = '---\n' + content
        }

        // Validate it has the closing --- for frontmatter
        const frontmatterEndIndex = content.indexOf('---', 3)
        if (frontmatterEndIndex === -1) {
          setGenerateError('Generated content is missing valid YAML frontmatter. Please try again.')
          return
        }

        setGeneratedContent(content)
        setGeneratedFilename(generatePromptName(promptDescription))
      } else {
        setGenerateError(result.error || 'Failed to generate prompt')
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate prompt')
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle completing the wizard
  const handleComplete = () => {
    // Always mark onboarding as complete when user finishes the wizard
    // This enables InlineHints to show helpful tips
    markOnboardingComplete()

    // If they checked "Don't show again", also save that preference
    if (dontShowAgain) {
      dismissWizard()
    }

    // Return the result
    if (selectedTemplate) {
      onComplete({ template: selectedTemplate })
    } else if (generatedContent) {
      onComplete({
        generatedContent,
        filename: generatedFilename || 'my-prompt'
      })
    } else {
      onComplete({})
    }
  }

  // Handle skip/close
  const handleClose = () => {
    // Always mark onboarding as complete when user closes the wizard
    // This enables InlineHints to show helpful tips
    markOnboardingComplete()

    // If they checked "Don't show again", also save that preference
    if (dontShowAgain) {
      dismissWizard()
    }
    onClose()
  }

  // Navigation helpers
  const canGoBack = currentStep !== 'welcome'
  const canGoForward = currentStep === 'welcome' || (currentStep === 'api-keys' && configuredProviders.length > 0)

  const goBack = () => {
    if (currentStep === 'api-keys') setCurrentStep('welcome')
    else if (currentStep === 'create-prompt') setCurrentStep('api-keys')
  }

  const goForward = () => {
    if (currentStep === 'welcome') setCurrentStep('api-keys')
    else if (currentStep === 'api-keys') setCurrentStep('create-prompt')
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          width: '90%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: theme === 'dark' ? '0 25px 80px rgba(0, 0, 0, 0.6)' : '0 25px 80px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={22} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
                Welcome to Prompd
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: colors.textSecondary }}>
                {currentStep === 'welcome' && "Let's get you set up"}
                {currentStep === 'api-keys' && 'Configure your AI provider'}
                {currentStep === 'create-prompt' && 'Create your first prompt'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Indicator */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {['welcome', 'api-keys', 'create-prompt'].map((step, index) => (
              <React.Fragment key={step}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: currentStep === step || ['welcome', 'api-keys', 'create-prompt'].indexOf(currentStep) > index
                      ? colors.primary
                      : colors.bgTertiary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: currentStep === step || ['welcome', 'api-keys', 'create-prompt'].indexOf(currentStep) > index
                      ? 'white'
                      : colors.textMuted,
                    transition: 'all 0.3s ease'
                  }}
                >
                  {['welcome', 'api-keys', 'create-prompt'].indexOf(currentStep) > index ? (
                    <Check size={14} />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < 2 && (
                  <div
                    style={{
                      flex: 1,
                      height: '2px',
                      background: ['welcome', 'api-keys', 'create-prompt'].indexOf(currentStep) > index
                        ? colors.primary
                        : colors.bgTertiary,
                      transition: 'all 0.3s ease'
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>Welcome</span>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>API Keys</span>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>Create</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px'
                }}
              >
                <Sparkles size={40} color="white" />
              </div>

              <h3 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: 600, color: colors.text }}>
                Welcome to Prompd!
              </h3>

              <p style={{ margin: '0 0 32px', fontSize: '15px', color: colors.textSecondary, maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                Prompd helps you create, manage, and share reusable AI prompts.
                Let's get you started with a quick setup.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: colors.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Key size={16} color={colors.success} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>Configure API Keys</div>
                    <div style={{ fontSize: '13px', color: colors.textSecondary }}>Connect your favorite AI providers</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: colors.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={16} color={colors.success} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>Create Your First Prompt</div>
                    <div style={{ fontSize: '13px', color: colors.textSecondary }}>Choose a template or describe what you need</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: colors.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={16} color={colors.success} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>Start Building</div>
                    <div style={{ fontSize: '13px', color: colors.textSecondary }}>Execute and iterate on your prompts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API Keys Step */}
          {currentStep === 'api-keys' && (
            <div>
              {/* Success Message */}
              {keySaveSuccess && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.successBg,
                    border: `1px solid ${colors.successBorder}`,
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <Check size={20} style={{ color: colors.success, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.success }}>API key saved successfully!</span>
                </div>
              )}

              {/* Error Message */}
              {keySaveError && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.errorBg,
                    border: `1px solid ${colors.errorBorder}`,
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.error }}>{keySaveError}</span>
                </div>
              )}

              {/* Configured Providers */}
              {configuredProviders.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '12px' }}>
                    Configured Providers
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {configuredProviders.map(providerId => {
                      const provider = availableProviders.find(p => p.id === providerId)
                      return (
                        <div
                          key={providerId}
                          style={{
                            padding: '8px 12px',
                            background: colors.successBg,
                            border: `1px solid ${colors.successBorder}`,
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Check size={14} color={colors.success} />
                          <span style={{ fontSize: '13px', color: colors.success }}>
                            {provider?.name || providerId}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Add Provider Section */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '12px' }}>
                  {configuredProviders.length > 0 ? 'Add Another Provider' : 'Select a Provider'}
                </div>

                {!showCustomProvider ? (
                  <>
                    {/* Provider Dropdown */}
                    <select
                      value={selectedProvider}
                      onChange={(e) => {
                        setSelectedProvider(e.target.value)
                        setKeySaveError(null)
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: colors.text,
                        cursor: 'pointer',
                        marginBottom: '12px',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(colors.textSecondary)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        backgroundSize: '16px'
                      }}
                    >
                      <option value="">Select a provider...</option>
                      {availableProviders
                        .filter(p => !configuredProviders.includes(p.id) && !p.isLocal)
                        .map(provider => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                    </select>

                    {/* Custom Provider Button */}
                    <button
                      onClick={() => setShowCustomProvider(true)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'transparent',
                        border: `1px dashed ${colors.border}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: colors.textSecondary,
                        transition: 'all 0.2s ease',
                        marginBottom: '16px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = colors.primary
                        e.currentTarget.style.color = colors.primary
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = colors.border
                        e.currentTarget.style.color = colors.textSecondary
                      }}
                    >
                      <Plus size={14} />
                      Add Custom Provider (OpenAI-compatible)
                    </button>
                  </>
                ) : (
                  <>
                    {/* Custom Provider Form */}
                    <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                          Provider ID
                        </label>
                        <input
                          type="text"
                          value={customProviderId}
                          onChange={(e) => setCustomProviderId(e.target.value)}
                          placeholder="my-custom-provider"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                            color: colors.text,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={customProviderName}
                          onChange={(e) => setCustomProviderName(e.target.value)}
                          placeholder="My Custom Provider"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                            color: colors.text,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                          Base URL
                        </label>
                        <input
                          type="text"
                          value={customBaseUrl}
                          onChange={(e) => setCustomBaseUrl(e.target.value)}
                          placeholder="https://api.example.com/v1"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            fontSize: '14px',
                            color: colors.text,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setShowCustomProvider(false)
                        setCustomProviderId('')
                        setCustomProviderName('')
                        setCustomBaseUrl('')
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: colors.primary,
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      <ChevronLeft size={14} />
                      Back to Provider List
                    </button>
                  </>
                )}

                {/* API Key Input */}
                {(selectedProvider || showCustomProvider) && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                      API Key
                      {!showCustomProvider && selectedProvider && (
                        (() => {
                          const provider = availableProviders.find(p => p.id === selectedProvider)
                          return provider?.keyPrefix ? ` (starts with ${provider.keyPrefix})` : ''
                        })()
                      )}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value)
                          setKeySaveError(null)
                        }}
                        placeholder="Enter your API key"
                        style={{
                          width: '100%',
                          padding: '10px 40px 10px 12px',
                          background: colors.bgSecondary,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          fontSize: '14px',
                          color: colors.text,
                          fontFamily: 'monospace',
                          boxSizing: 'border-box'
                        }}
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        type="button"
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: colors.textSecondary
                        }}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {/* Console URL Link */}
                    {!showCustomProvider && selectedProvider && (
                      (() => {
                        const provider = availableProviders.find(p => p.id === selectedProvider)
                        if (!provider?.consoleUrl) return null
                        return (
                          <div style={{ marginTop: '8px' }}>
                            <a
                              href={provider.consoleUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '12px',
                                color: colors.primary,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                textDecoration: 'none'
                              }}
                            >
                              Get your API key from {provider.name}
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        )
                      })()
                    )}
                  </div>
                )}

                {/* Save Button */}
                {(selectedProvider || showCustomProvider) && (
                  <button
                    onClick={handleSaveApiKey}
                    disabled={isSavingKey || !apiKey.trim()}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: isSavingKey || !apiKey.trim() ? colors.bgTertiary : colors.primary,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: isSavingKey || !apiKey.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'white',
                      opacity: isSavingKey || !apiKey.trim() ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isSavingKey ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        Save API Key
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Skip Option */}
              {configuredProviders.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: '24px' }}>
                  <button
                    onClick={() => setCurrentStep('create-prompt')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.textSecondary,
                      textDecoration: 'underline'
                    }}
                  >
                    Skip for now (you can add keys later)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Create Prompt Step */}
          {currentStep === 'create-prompt' && (
            <div>
              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <button
                  onClick={() => {
                    setCreateMode('template')
                    setGeneratedContent(null)
                    setGenerateError(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: createMode === 'template' ? colors.primary : colors.bgSecondary,
                    border: `1px solid ${createMode === 'template' ? colors.primary : colors.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: createMode === 'template' ? 'white' : colors.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <FileText size={16} />
                  Choose Template
                </button>
                <button
                  onClick={() => {
                    setCreateMode('generate')
                    setSelectedTemplate(null)
                  }}
                  disabled={configuredProviders.length === 0}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: createMode === 'generate' ? colors.primary : colors.bgSecondary,
                    border: `1px solid ${createMode === 'generate' ? colors.primary : colors.border}`,
                    borderRadius: '8px',
                    cursor: configuredProviders.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: createMode === 'generate' ? 'white' : colors.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: configuredProviders.length === 0 ? 0.5 : 1,
                    transition: 'all 0.2s ease'
                  }}
                  title={configuredProviders.length === 0 ? 'Configure an API key to use AI generation' : ''}
                >
                  <Sparkles size={16} />
                  Create New
                </button>
              </div>

              {/* Template Selection - Tile Grid */}
              {createMode === 'template' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px'
                }}>
                  {PROMPT_TEMPLATES.map(template => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '20px 16px',
                        background: selectedTemplate?.id === template.id ? colors.primary + '15' : colors.bgSecondary,
                        border: `2px solid ${selectedTemplate?.id === template.id ? colors.primary : colors.border}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        minHeight: '140px'
                      }}
                      onMouseOver={(e) => {
                        if (selectedTemplate?.id !== template.id) {
                          e.currentTarget.style.borderColor = colors.primary + '50'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }
                      }}
                      onMouseOut={(e) => {
                        if (selectedTemplate?.id !== template.id) {
                          e.currentTarget.style.borderColor = colors.border
                          e.currentTarget.style.transform = 'translateY(0)'
                        }
                      }}
                    >
                      {/* Selection indicator */}
                      {selectedTemplate?.id === template.id && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: colors.primary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Check size={12} color="white" />
                        </div>
                      )}

                      {/* Icon */}
                      <div
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '12px',
                          background: selectedTemplate?.id === template.id ? colors.primary : colors.bgTertiary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: selectedTemplate?.id === template.id ? 'white' : colors.textSecondary,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {template.icon}
                      </div>

                      {/* Text */}
                      <div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: colors.text,
                          marginBottom: '4px'
                        }}>
                          {template.name}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: colors.textSecondary,
                          lineHeight: 1.4,
                          maxWidth: '140px'
                        }}>
                          {template.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Generate from Description */}
              {createMode === 'generate' && (
                <div>
                  {/* Error Message */}
                  {generateError && (
                    <div
                      style={{
                        padding: '12px 16px',
                        background: colors.errorBg,
                        border: `1px solid ${colors.errorBorder}`,
                        borderRadius: '8px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
                      <span style={{ fontSize: '14px', color: colors.error }}>{generateError}</span>
                    </div>
                  )}

                  {!generatedContent ? (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '14px', fontWeight: 500, color: colors.text, display: 'block', marginBottom: '8px' }}>
                          Describe what you want your prompt to do
                        </label>
                        <textarea
                          value={promptDescription}
                          onChange={(e) => {
                            setPromptDescription(e.target.value)
                            setGenerateError(null)
                          }}
                          placeholder="For example: A prompt that helps me write professional LinkedIn posts, with options for tone and topic..."
                          rows={4}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '8px',
                            fontSize: '14px',
                            color: colors.text,
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box',
                            lineHeight: 1.5
                          }}
                        />
                      </div>

                      <button
                        onClick={handleGeneratePrompt}
                        disabled={isGenerating || !promptDescription.trim()}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: isGenerating || !promptDescription.trim() ? colors.bgTertiary : `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                          border: 'none',
                          borderRadius: '8px',
                          cursor: isGenerating || !promptDescription.trim() ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'white',
                          opacity: isGenerating || !promptDescription.trim() ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            Generating your prompt...
                          </>
                        ) : (
                          <>
                            <Sparkles size={18} />
                            Generate Prompt
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Generated Content Preview */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <label style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>
                            Generated Prompt
                          </label>
                          <div style={{
                            padding: '4px 8px',
                            background: colors.successBg,
                            border: `1px solid ${colors.successBorder}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: colors.success,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Check size={12} />
                            Ready to use
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '12px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '8px',
                            maxHeight: '200px',
                            overflow: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: colors.textSecondary,
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5
                          }}
                        >
                          {generatedContent}
                        </div>
                      </div>

                      {/* Filename Input */}
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                          Filename
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="text"
                            value={generatedFilename}
                            onChange={(e) => setGeneratedFilename(e.target.value)}
                            placeholder="my-prompt"
                            style={{
                              flex: 1,
                              padding: '10px 12px',
                              background: colors.bgSecondary,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: colors.text,
                              boxSizing: 'border-box'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: colors.textMuted }}>.prmd</span>
                        </div>
                      </div>

                      {/* Regenerate Button */}
                      <button
                        onClick={() => {
                          setGeneratedContent(null)
                          setGeneratedFilename('')
                        }}
                        style={{
                          padding: '10px 16px',
                          background: colors.bgSecondary,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: colors.textSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <ChevronLeft size={14} />
                        Try Different Description
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`,
            background: colors.bgSecondary
          }}
        >
          {/* Don't show again checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: colors.primary,
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '13px', color: colors.textSecondary }}>
              Don't show this again
            </span>
          </label>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {canGoBack && (
              <button
                onClick={goBack}
                style={{
                  padding: '10px 20px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: colors.text,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}

            {currentStep === 'create-prompt' ? (
              <button
                onClick={handleComplete}
                disabled={createMode === 'template' ? !selectedTemplate : !generatedContent}
                style={{
                  padding: '10px 24px',
                  background: (createMode === 'template' ? !selectedTemplate : !generatedContent)
                    ? colors.bgTertiary
                    : `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (createMode === 'template' ? !selectedTemplate : !generatedContent)
                    ? 'not-allowed'
                    : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: (createMode === 'template' ? !selectedTemplate : !generatedContent)
                    ? colors.textMuted
                    : 'white',
                  opacity: (createMode === 'template' ? !selectedTemplate : !generatedContent) ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                Create
                <Sparkles size={16} />
              </button>
            ) : (
              <button
                onClick={goForward}
                style={{
                  padding: '10px 24px',
                  background: colors.primary,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = colors.primaryHover)}
                onMouseOut={(e) => (e.currentTarget.style.background = colors.primary)}
              >
                {currentStep === 'api-keys' && configuredProviders.length > 0 ? 'Continue' : 'Next'}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// Re-export from onboardingService for backwards compatibility
export { isOnboardingComplete, isWizardDismissed, resetOnboardingState as resetOnboarding } from '../services/onboardingService'

export default FirstTimeSetupWizard
