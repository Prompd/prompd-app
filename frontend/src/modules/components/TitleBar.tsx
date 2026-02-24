/**
 * Custom Title Bar with Menu Proxy
 *
 * Replaces the native Electron title bar with a custom one that:
 * - Shows a menu bar (File, Edit, View, Project, Run, Help) on the left
 * - Displays the window title centered
 * - Provides a drag region for window movement
 * - Dynamically themes with the app (light/dark)
 *
 * The native menu is still registered for keyboard accelerators.
 * Menu items here trigger the same IPC events as the native menu.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { MenuState } from '../../electron.d'

// ── Types ──

interface MenuItemDef {
  label?: string
  accelerator?: string
  action?: () => void
  type?: 'separator'
  enabled?: boolean | ((state: MenuState) => boolean)
  submenu?: MenuItemDef[]
}

interface MenuDef {
  label: string
  items: MenuItemDef[]
}

interface TitleBarProps {
  theme: 'light' | 'dark'
}

// ── Helpers ──

const electronAPI = (window as unknown as { electronAPI?: Record<string, unknown> })?.electronAPI as
  import('../../electron.d').ElectronAPI | undefined

function isEnabled(item: MenuItemDef, state: MenuState): boolean {
  if (item.enabled === undefined) return true
  if (typeof item.enabled === 'function') return item.enabled(state)
  return item.enabled
}

// ── Menu Definitions ──

function buildMenus(ms: MenuState): MenuDef[] {
  const api = electronAPI
  if (!api) return []

  return [
    {
      label: 'File',
      items: [
        { label: 'New File', accelerator: 'Ctrl+N', action: () => api.triggerMenuAction('menu-new-file') },
        { label: 'New Project...', action: () => api.triggerMenuAction('menu-new-project') },
        { label: 'Open File...', accelerator: 'Ctrl+O', action: () => api.openFileDialog() },
        { label: 'Open Folder...', accelerator: 'Ctrl+Shift+O', action: () => api.openFolderDialog() },
        { label: 'Close Folder', enabled: ms.hasWorkspace, action: () => api.closeFolder() },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'Ctrl+W', enabled: ms.hasActiveTab, action: () => api.triggerMenuAction('menu-close-tab') },
        { label: 'Close All Tabs', accelerator: 'Ctrl+Shift+W', enabled: ms.hasActiveTab, action: () => api.triggerMenuAction('menu-close-all-tabs') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Ctrl+S', enabled: ms.hasActiveTab, action: () => api.triggerMenuAction('menu-save') },
        { label: 'Save As...', accelerator: 'Ctrl+Shift+S', enabled: ms.hasActiveTab, action: () => api.triggerMenuAction('menu-save-as') },
        { type: 'separator' },
        { label: 'Settings...', accelerator: 'Ctrl+,', action: () => api.triggerMenuAction('menu-settings') },
        { label: 'API Keys...', action: () => api.triggerMenuAction('menu-api-keys') },
        { type: 'separator' },
        { label: 'Quit', action: () => api.quit() },
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', accelerator: 'Ctrl+Z', action: () => api.editUndo() },
        { label: 'Redo', accelerator: 'Ctrl+Y', action: () => api.editRedo() },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Ctrl+X', action: () => api.editCut() },
        { label: 'Copy', accelerator: 'Ctrl+C', action: () => api.editCopy() },
        { label: 'Paste', accelerator: 'Ctrl+V', action: () => api.editPaste() },
        { label: 'Delete', action: () => api.editDelete() },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Ctrl+A', action: () => api.editSelectAll() },
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle File Explorer', accelerator: 'Ctrl+B', action: () => api.triggerMenuAction('menu-toggle-sidebar', 'explorer') },
        { label: 'Toggle AI Chat', accelerator: 'Ctrl+Shift+A', action: () => api.triggerMenuAction('menu-toggle-sidebar', 'ai') },
        { label: 'Toggle Git Panel', accelerator: 'Ctrl+Shift+G', action: () => api.triggerMenuAction('menu-toggle-sidebar', 'git') },
        { label: 'Toggle Output Panel', accelerator: 'Ctrl+Shift+M', action: () => api.triggerMenuAction('menu-toggle-output-panel') },
        { type: 'separator' },
        { label: 'Command Palette', accelerator: 'Ctrl+Shift+P', action: () => api.triggerMenuAction('menu-command-palette') },
        { type: 'separator' },
        { label: 'Wizard View', accelerator: 'Ctrl+1', action: () => api.triggerMenuAction('menu-set-view-mode', 'wizard') },
        { label: 'Design View', accelerator: 'Ctrl+2', action: () => api.triggerMenuAction('menu-set-view-mode', 'design') },
        { label: 'Code View', accelerator: 'Ctrl+3', action: () => api.triggerMenuAction('menu-set-view-mode', 'code') },
        { type: 'separator' },
        { label: 'Toggle Dark Mode', accelerator: 'Ctrl+Shift+T', action: () => api.triggerMenuAction('menu-toggle-theme') },
        { type: 'separator' },
        { label: 'Reload', action: () => api.viewReload() },
        { label: 'Force Reload', action: () => api.viewForceReload() },
        { label: 'Toggle Developer Tools', action: () => api.viewToggleDevTools() },
        { type: 'separator' },
        { label: 'Reset Zoom', action: () => api.viewResetZoom() },
        { label: 'Zoom In', action: () => api.viewZoomIn() },
        { label: 'Zoom Out', action: () => api.viewZoomOut() },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', action: () => api.viewToggleFullscreen() },
      ]
    },
    {
      label: 'Project',
      items: [
        { label: 'Open Project...', action: () => api.triggerMenuAction('menu-open-project') },
        { type: 'separator' },
        { label: 'Save Project', enabled: ms.hasWorkspace, action: () => api.triggerMenuAction('menu-save-project') },
        { label: 'Manage Projects...', action: () => api.triggerMenuAction('menu-manage-projects') },
        { type: 'separator' },
        { label: 'Build Package', accelerator: 'Ctrl+Shift+B', enabled: ms.hasWorkspace, action: () => api.triggerMenuAction('menu-package-create') },
        { label: 'Publish Package...', enabled: ms.hasWorkspace, action: () => api.triggerMenuAction('menu-package-publish') },
        { type: 'separator' },
        { label: 'Install Dependencies...', enabled: ms.hasWorkspace, action: () => api.triggerMenuAction('menu-run-install') },
        { label: 'Install Package...', action: () => api.triggerMenuAction('menu-package-install') },
        { type: 'separator' },
        { label: 'Browse Registry', action: () => api.openExternal('https://www.prompdhub.ai') },
      ]
    },
    {
      label: 'Run',
      items: [
        { label: 'Execute', accelerator: 'F5', enabled: ms.canExecute, action: () => api.triggerMenuAction('menu-run-execute') },
        { label: 'Stop', accelerator: 'Shift+F5', enabled: ms.isExecutionActive, action: () => api.triggerMenuAction('menu-run-stop') },
        { type: 'separator' },
        { label: 'Deploy Workflow...', enabled: ms.isWorkflowFile, action: () => api.triggerMenuAction('menu-package-deploy') },
        { label: 'Manage Deployments...', action: () => api.triggerMenuAction('menu-deployment-manage') },
        { type: 'separator' },
        { label: 'Manage Schedules...', action: () => api.triggerMenuAction('menu-scheduler-settings') },
        { label: 'Service Settings...', action: () => api.triggerMenuAction('menu-scheduler-service') },
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation', action: () => api.openExternal('https://prompd.io/docs') },
        { label: 'Report Issue', action: () => api.openExternal('https://github.com/Logikbug/prompd.app/issues') },
        { type: 'separator' },
        { label: 'Check for Updates', action: () => api.checkForUpdates() },
        { type: 'separator' },
        { label: 'About Prompd', action: () => api.triggerMenuAction('menu-about') },
      ]
    },
  ]
}

// ── Dropdown Component ──

function MenuDropdown({
  items,
  menuState,
  anchorRect,
  focusedIndex,
  onItemClick,
  onItemHover,
}: {
  items: MenuItemDef[]
  menuState: MenuState
  anchorRect: DOMRect
  focusedIndex: number
  onItemClick: (item: MenuItemDef) => void
  onItemHover: (index: number) => void
}) {
  const style: React.CSSProperties = {
    top: anchorRect.bottom,
    left: anchorRect.left,
  }

  let visibleIndex = -1

  return createPortal(
    <div className="titlebar-dropdown" style={style}>
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="titlebar-dropdown-separator" />
        }
        visibleIndex++
        const currentIndex = visibleIndex
        const enabled = isEnabled(item, menuState)
        const focused = currentIndex === focusedIndex
        return (
          <button
            key={i}
            className={`titlebar-dropdown-item${focused ? ' focused' : ''}`}
            disabled={!enabled}
            onMouseEnter={() => onItemHover(currentIndex)}
            onClick={(e) => {
              e.stopPropagation()
              if (enabled) onItemClick(item)
            }}
          >
            <span>{item.label}</span>
            {item.accelerator && <span className="accelerator">{item.accelerator}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}

// ── SVG mask for the Prompd "P" logo ──

const P_MASK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 475 487">` +
  `<path fill="white" d="M 271.6313,29.109924 C 456.06055,29.109924 454.60452,304.1 270.40336,304.1 L 228,304 v -47.30173 l 43.85191,0.0317 c 118.41324,0 116.08205,-178.966717 -0.82527,-178.966717 L 132.15087,77.622831 129.6,420.52 c -0.33992,0.0728 -45.968529,35.12868 -45.968529,35.12868 L 83.506489,28.866413 Z"/>` +
  `<path fill="white" d="m 156,102 103.33423,0.32678 c 88.07508,0 87.938,129.66692 1.26051,129.66692 l -32.5414,0.0925 -0.0533,-47.08616 32.66331,-0.23913 c 27.90739,0 25.69827,-34.89447 -0.0611,-34.99087 L 204.00004,150 c 0.90517,68.30467 0.52,211.29643 0.52,211.29643 0,0 -48.54879,38.04493 -48.62668,38.05052 z"/>` +
  `</svg>`
)

// ── TitleBar Component ──

export default function TitleBar({ theme }: TitleBarProps) {
  const [windowTitle, setWindowTitle] = useState('Prompd')
  const [menuState, setMenuState] = useState<MenuState>({
    hasWorkspace: false,
    hasActiveTab: false,
    isPrompdFile: false,
    isWorkflowFile: false,
    canExecute: false,
    isExecutionActive: false,
  })
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const menuRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const isHoveringRef = useRef(false)

  // Gradient logo — direct DOM updates, zero re-renders
  const titlebarRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const logo = logoRef.current
    if (!logo) return

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (!logo) return
        const rect = logo.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const deg = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
        logo.style.background = `conic-gradient(from ${deg}deg, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #06b6d4)`
        logo.style.transition = 'none'
      })
    }
    const onLeave = () => {
      if (!logo) return
      logo.style.background = 'linear-gradient(135deg, #06b6d4, #3b82f6)'
      logo.style.transition = 'background 0.4s ease'
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Fetch initial title + menu state, listen for updates
  useEffect(() => {
    const api = electronAPI
    if (!api) return

    api.getWindowTitle().then(setWindowTitle)
    api.getMenuState().then(setMenuState)

    const unsubTitle = api.onWindowTitleChanged((title: string) => setWindowTitle(title))
    const unsubMenu = api.onMenuStateChanged((state: MenuState) => setMenuState(state))

    return () => {
      unsubTitle()
      unsubMenu()
    }
  }, [])

  // Click-outside to close
  useEffect(() => {
    if (!activeMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.titlebar-menu') && !target.closest('.titlebar-dropdown')) {
        setActiveMenu(null)
        setFocusedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeMenu])

  // Keyboard navigation
  useEffect(() => {
    if (!activeMenu) return

    const menus = buildMenus(menuState)
    const currentMenuIdx = menus.findIndex(m => m.label === activeMenu)
    if (currentMenuIdx === -1) return

    const currentItems = menus[currentMenuIdx].items
    const enabledIndices = currentItems
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.type !== 'separator' && isEnabled(item, menuState))
      .map((_, vi) => vi)

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setActiveMenu(null)
          setFocusedIndex(-1)
          break
        case 'ArrowDown': {
          e.preventDefault()
          const nextIdx = focusedIndex < enabledIndices.length - 1 ? focusedIndex + 1 : 0
          setFocusedIndex(nextIdx)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prevIdx = focusedIndex > 0 ? focusedIndex - 1 : enabledIndices.length - 1
          setFocusedIndex(prevIdx)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const nextMenu = menus[(currentMenuIdx + 1) % menus.length]
          setActiveMenu(nextMenu.label)
          setFocusedIndex(-1)
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const prevMenu = menus[(currentMenuIdx - 1 + menus.length) % menus.length]
          setActiveMenu(prevMenu.label)
          setFocusedIndex(-1)
          break
        }
        case 'Enter': {
          if (focusedIndex >= 0) {
            // Map focusedIndex back to actual item
            let vi = -1
            for (const item of currentItems) {
              if (item.type === 'separator') continue
              if (!isEnabled(item, menuState)) continue
              vi++
              if (vi === focusedIndex) {
                item.action?.()
                setActiveMenu(null)
                setFocusedIndex(-1)
                break
              }
            }
          }
          break
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeMenu, focusedIndex, menuState])

  const handleMenuClick = useCallback((label: string) => {
    if (activeMenu === label) {
      setActiveMenu(null)
      setFocusedIndex(-1)
    } else {
      setActiveMenu(label)
      setFocusedIndex(-1)
    }
  }, [activeMenu])

  const handleMenuHover = useCallback((label: string) => {
    if (activeMenu && activeMenu !== label) {
      setActiveMenu(label)
      setFocusedIndex(-1)
    }
  }, [activeMenu])

  const handleItemClick = useCallback((item: MenuItemDef) => {
    item.action?.()
    setActiveMenu(null)
    setFocusedIndex(-1)
  }, [])

  // Don't render in non-Electron environments
  if (!electronAPI) return null

  const menus = buildMenus(menuState)
  const activeMenuDef = menus.find(m => m.label === activeMenu)
  const anchorEl = activeMenu ? menuRefs.current.get(activeMenu) : null
  const anchorRect = anchorEl?.getBoundingClientRect()

  return (
    <div ref={titlebarRef} className="titlebar" data-theme={theme === 'dark' ? 'dark' : undefined}>
      {/* Animated gradient P logo — updated via direct DOM, no re-renders */}
      <div className="titlebar-logo">
        <div
          ref={logoRef}
          style={{
            width: 16,
            height: 16,
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            WebkitMaskImage: `url("data:image/svg+xml,${P_MASK_SVG}")`,
            maskImage: `url("data:image/svg+xml,${P_MASK_SVG}")`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
      </div>

      {/* Menu bar */}
      <div className="titlebar-menu">
        {menus.map(menu => (
          <button
            key={menu.label}
            ref={(el) => { if (el) menuRefs.current.set(menu.label, el) }}
            className={`titlebar-menu-label${activeMenu === menu.label ? ' active' : ''}`}
            onClick={() => handleMenuClick(menu.label)}
            onMouseEnter={() => handleMenuHover(menu.label)}
          >
            {menu.label}
          </button>
        ))}
      </div>

      {/* Centered title */}
      <div className="titlebar-title">{windowTitle}</div>

      {/* Dropdown */}
      {activeMenuDef && anchorRect && (
        <MenuDropdown
          items={activeMenuDef.items}
          menuState={menuState}
          anchorRect={anchorRect}
          focusedIndex={focusedIndex}
          onItemClick={handleItemClick}
          onItemHover={setFocusedIndex}
        />
      )}
    </div>
  )
}
