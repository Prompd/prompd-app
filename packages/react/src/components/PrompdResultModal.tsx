import React, { useState } from 'react'
import { X, FileText, Code, Info } from 'lucide-react'
import type { PrompdResultModalProps } from '../types'
import { clsx } from 'clsx'

type TabType = 'result' | 'compiled' | 'metadata'

export function PrompdResultModal({
  result,
  isOpen,
  onClose,
  onRerun,
  className
}: PrompdResultModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('result')
  const [editedParameters, setEditedParameters] = useState(
    result.request.parameters || {}
  )

  if (!isOpen) return null

  const handleRerun = () => {
    if (onRerun) {
      onRerun(editedParameters)
    }
  }

  const handleParameterChange = (key: string, value: unknown) => {
    setEditedParameters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/50 backdrop-blur-sm',
        className
      )}
      onClick={onClose}
    >
      <div
        className={clsx(
          'relative w-full max-w-5xl max-h-[90vh] overflow-hidden',
          'bg-white dark:bg-slate-900 rounded-2xl shadow-2xl',
          'flex flex-col'
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Execution Result
              </h2>
              {result.request.packageName && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {result.request.packageName}@{result.request.packageVersion}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'text-slate-600 dark:text-slate-400'
            )}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-slate-200 dark:border-slate-700">
          <TabButton
            icon={FileText}
            label="Result"
            active={activeTab === 'result'}
            onClick={() => setActiveTab('result')}
          />
          <TabButton
            icon={Code}
            label="Compiled Prompt"
            active={activeTab === 'compiled'}
            onClick={() => setActiveTab('compiled')}
          />
          <TabButton
            icon={Info}
            label="Metadata"
            active={activeTab === 'metadata'}
            onClick={() => setActiveTab('metadata')}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'result' && (
            <ResultTab
              result={result}
              editedParameters={editedParameters}
              onParameterChange={handleParameterChange}
              onRerun={onRerun ? handleRerun : undefined}
            />
          )}

          {activeTab === 'compiled' && (
            <CompiledTab compiledPrompt={result.compiledPrompt} />
          )}

          {activeTab === 'metadata' && (
            <MetadataTab result={result} />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-t-lg transition-all',
        'border-b-2',
        active
          ? 'bg-slate-50 dark:bg-slate-800 border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
    </button>
  )
}

function ResultTab({
  result,
  editedParameters,
  onParameterChange,
  onRerun
}: {
  result: PrompdResultModalProps['result']
  editedParameters: Record<string, unknown>
  onParameterChange: (key: string, value: unknown) => void
  onRerun?: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Response Content */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          Response
        </h3>
        <div className={clsx(
          'p-4 rounded-lg',
          'bg-slate-50 dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
          'prose dark:prose-invert max-w-none'
        )}>
          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {result.response.content}
          </p>
        </div>
      </div>

      {/* Parameters */}
      {Object.keys(editedParameters).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Parameters
          </h3>
          <div className="space-y-3">
            {Object.entries(editedParameters).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {key}
                </label>
                <input
                  type="text"
                  value={String(value)}
                  onChange={e => onParameterChange(key, e.target.value)}
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg',
                    'bg-white dark:bg-slate-900',
                    'border border-slate-300 dark:border-slate-600',
                    'text-slate-900 dark:text-white',
                    'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    'transition-all'
                  )}
                />
              </div>
            ))}
          </div>

          {onRerun && (
            <button
              onClick={onRerun}
              className={clsx(
                'mt-4 px-6 py-2 rounded-lg font-medium',
                'bg-gradient-to-r from-blue-600 to-purple-600',
                'text-white hover:shadow-lg',
                'transform hover:scale-105 transition-all'
              )}
            >
              Rerun with Updated Parameters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CompiledTab({
  compiledPrompt
}: {
  compiledPrompt: PrompdResultModalProps['result']['compiledPrompt']
}) {
  return (
    <div className="space-y-6">
      {/* Final Prompt */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          Final Prompt
        </h3>
        <pre className={clsx(
          'p-4 rounded-lg overflow-x-auto',
          'bg-slate-50 dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
          'text-sm text-slate-700 dark:text-slate-300'
        )}>
          {compiledPrompt.finalPrompt}
        </pre>
      </div>

      {/* Sections */}
      {Object.entries(compiledPrompt.sections).map(([section, content]) => (
        content && (
          <div key={section}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 capitalize">
              {section} Section
            </h3>
            <pre className={clsx(
              'p-4 rounded-lg overflow-x-auto',
              'bg-slate-50 dark:bg-slate-800',
              'border border-slate-200 dark:border-slate-700',
              'text-sm text-slate-700 dark:text-slate-300'
            )}>
              {content}
            </pre>
          </div>
        )
      ))}
    </div>
  )
}

function MetadataTab({
  result
}: {
  result: PrompdResultModalProps['result']
}) {
  const metadata = [
    { label: 'Execution ID', value: result.id },
    { label: 'Status', value: result.status },
    { label: 'Timestamp', value: new Date(result.timestamp).toLocaleString() },
    { label: 'Provider', value: result.response.provider },
    { label: 'Model', value: result.response.model },
    { label: 'Compiler', value: result.compiledPrompt.metadata.compiler },
    { label: 'Compiled At', value: new Date(result.compiledPrompt.metadata.compiledAt).toLocaleString() }
  ]

  if (result.response.usage) {
    metadata.push(
      { label: 'Prompt Tokens', value: result.response.usage.promptTokens.toString() },
      { label: 'Completion Tokens', value: result.response.usage.completionTokens.toString() },
      { label: 'Total Tokens', value: result.response.usage.totalTokens.toString() }
    )
  }

  return (
    <div className="space-y-3">
      {metadata.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700 last:border-0"
        >
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {label}
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}
