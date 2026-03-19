/**
 * TestExplorerPanel - Sidebar panel for test discovery and management.
 * Shows .prmd files with colocated .test.prmd sidecars and their status.
 */

import { useEffect, useCallback, useMemo } from 'react'
import { Play, RefreshCw, Ban, Square } from 'lucide-react'
import { useTestStore, type TestSuiteInfo } from '@/stores/testStore'
import { useEditorStore } from '@/stores/editorStore'
import { useUIStore } from '@/stores/uiStore'
import { SidebarPanelHeader } from '../SidebarPanelHeader'
import { TestFileItem } from './TestTreeItem'
import { ProviderModelSelector } from '../ProviderModelSelector'

/**
 * Group suites by relative directory, sorted alphabetically.
 */
function groupByDirectory(
  suites: TestSuiteInfo[],
  workspacePath: string
): Array<{ dir: string; suites: TestSuiteInfo[] }> {
  const groups = new Map<string, TestSuiteInfo[]>()

  for (const suite of suites) {
    let rel = suite.targetPath.replace(/\\/g, '/')
    if (workspacePath) {
      const wp = workspacePath.replace(/\\/g, '/')
      if (rel.startsWith(wp)) {
        rel = rel.slice(wp.length).replace(/^\//, '')
      }
    }
    const parts = rel.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir)!.push(suite)
  }

  // Sort groups by directory name, sort suites within each group
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, dirSuites]) => ({
      dir,
      suites: dirSuites.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

export function TestExplorerPanel() {
  const discoveredSuites = useTestStore(state => state.discoveredSuites)
  const isDiscovering = useTestStore(state => state.isDiscovering)
  const isRunning = useTestStore(state => state.isRunning)
  const expandedFiles = useTestStore(state => state.expandedFiles)
  const discover = useTestStore(state => state.discover)
  const runTests = useTestStore(state => state.runTests)
  const runAll = useTestStore(state => state.runAll)
  const stopTests = useTestStore(state => state.stopTests)
  const toggleExpanded = useTestStore(state => state.toggleExpanded)

  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Auto-discover on mount and workspace change
  useEffect(() => {
    if (workspacePath) {
      discover(workspacePath)
    }
  }, [workspacePath, discover])

  const groups = useMemo(
    () => groupByDirectory(discoveredSuites, workspacePath || ''),
    [discoveredSuites, workspacePath]
  )

  const handleRunAll = useCallback(() => {
    if (workspacePath && !isRunning) {
      runAll(workspacePath)
    }
  }, [workspacePath, isRunning, runAll])

  const handleRunAllNoLlm = useCallback(() => {
    if (workspacePath && !isRunning) {
      runAll(workspacePath, { noLlm: true })
    }
  }, [workspacePath, isRunning, runAll])

  const handleRunFile = useCallback((targetPath: string) => {
    if (!isRunning) {
      runTests(targetPath)
    }
  }, [isRunning, runTests])

  const handleRefresh = useCallback(() => {
    if (workspacePath) {
      discover(workspacePath)
    }
  }, [workspacePath, discover])

  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)
  const testProvider = useTestStore(state => state.testProvider)
  const testModel = useTestStore(state => state.testModel)
  const setTestProvider = useTestStore(state => state.setTestProvider)
  const setTestModel = useTestStore(state => state.setTestModel)

  // Only providers with API keys configured
  const configuredProviders = useMemo(() => {
    if (!providersWithPricing) return []
    return providersWithPricing.filter(p => p.hasKey)
  }, [providersWithPricing])

  // Auto-select first configured provider if none selected
  useEffect(() => {
    if (!testProvider && configuredProviders.length > 0) {
      setTestProvider(configuredProviders[0].providerId)
      if (configuredProviders[0].models.length > 0) {
        setTestModel(configuredProviders[0].models[0].model)
      }
    }
  }, [testProvider, configuredProviders, setTestProvider, setTestModel])

  // Summary counts
  const totalSuites = discoveredSuites.length
  const passedCount = discoveredSuites.filter(s => s.lastStatus === 'pass').length
  const failedCount = discoveredSuites.filter(s => s.lastStatus === 'fail' || s.lastStatus === 'error').length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SidebarPanelHeader title="Test Explorer">
        <button
          onClick={handleRefresh}
          disabled={isDiscovering}
          title="Refresh"
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            padding: '4px',
            cursor: isDiscovering ? 'default' : 'pointer',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            opacity: isDiscovering ? 0.4 : 1,
          }}
        >
          <RefreshCw size={14} className={isDiscovering ? 'spin' : ''} />
        </button>
      </SidebarPanelHeader>

      {/* Action bar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button
          className="te-action-btn"
          onClick={handleRunAll}
          disabled={isRunning || totalSuites === 0}
          title="Run All Tests"
        >
          <Play size={12} />
          <span>Run All</span>
        </button>
        <button
          className="te-action-btn"
          onClick={handleRunAllNoLlm}
          disabled={isRunning || totalSuites === 0}
          title="Run All (structural only, no LLM calls)"
        >
          <Ban size={12} />
          <span>No LLM</span>
        </button>
        {isRunning && (
          <button
            className="te-action-btn te-action-stop"
            onClick={stopTests}
            title="Stop running tests"
          >
            <Square size={12} />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Provider/Model selector for test execution */}
      {configuredProviders.length > 0 && (
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <ProviderModelSelector
            providers={configuredProviders}
            selectedProvider={testProvider}
            selectedModel={testModel}
            onProviderChange={(p) => {
              setTestProvider(p)
              // Auto-select first model for new provider
              const prov = configuredProviders.find(pr => pr.providerId === p)
              if (prov && prov.models.length > 0) {
                setTestModel(prov.models[0].model)
              }
            }}
            onModelChange={setTestModel}
            layout="compact"
            showPricing={true}
            forceDropdown={true}
          />
        </div>
      )}

      {/* Summary bar (only after tests have run) */}
      {(passedCount > 0 || failedCount > 0) && (
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '4px 12px',
          fontSize: '11px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          color: 'var(--muted)',
        }}>
          {passedCount > 0 && (
            <span style={{ color: '#10b981' }}>{passedCount} passed</span>
          )}
          {failedCount > 0 && (
            <span style={{ color: '#ef4444' }}>{failedCount} failed</span>
          )}
          <span>{totalSuites} total</span>
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
        {totalSuites === 0 && !isDiscovering && (
          <div style={{
            padding: '24px 16px',
            color: 'var(--muted)',
            fontSize: '12px',
            textAlign: 'center',
            lineHeight: '18px',
          }}>
            {workspacePath
              ? 'No .test.prmd files found.'
              : 'Open a workspace to discover tests.'}
          </div>
        )}

        {groups.map(({ dir, suites }) => (
          <div key={dir || '__root'}>
            {dir && (
              <div className="te-dir-label">{dir}/</div>
            )}
            {suites.map((suite) => (
              <TestFileItem
                key={suite.testFilePath}
                suite={suite}
                expanded={expandedFiles.includes(suite.testFilePath)}
                onToggle={() => toggleExpanded(suite.testFilePath)}
                onRun={handleRunFile}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
