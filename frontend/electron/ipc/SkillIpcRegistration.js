/**
 * SkillIpcRegistration -- IPC handlers for skill:* channels
 *
 * Handles: skill:list
 *
 * Scans installed skills from:
 * - <workspace>/.prompd/skills/ (project-specific)
 * - ~/.prompd/skills/ (user-level, shared across workspaces)
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')

/**
 * Read a skill's prompd.json manifest and return skill info.
 *
 * @param {string} skillDir - Absolute path to the skill directory
 * @param {string} fallbackName - Fallback name if manifest has no name field
 * @param {string} scope - 'workspace' or 'user'
 * @returns {Promise<object|null>} Skill info or null if no manifest
 */
async function readSkillManifest(skillDir, fallbackName, scope) {
  const manifestPath = path.join(skillDir, 'prompd.json')
  if (!await fs.pathExists(manifestPath)) return null

  try {
    const manifest = await fs.readJson(manifestPath)
    const skillSection = manifest.skill || {}
    return {
      name: manifest.name || fallbackName,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      tools: manifest.tools || [],
      main: manifest.main || '',
      path: skillDir,
      scope,
      parameters: skillSection.parameters || undefined,
      allowedTools: skillSection.allowedTools || undefined,
    }
  } catch (err) {
    console.warn('[Skill IPC] Failed to read manifest:', manifestPath, err.message)
    return null
  }
}

/**
 * Scan a skills directory for installed skills.
 * Structure: .prompd/skills/@scope/name/ or .prompd/skills/name/
 *
 * @param {string} skillsDir - Absolute path to the skills directory
 * @param {string} scope - 'workspace' or 'user'
 * @returns {Promise<Array>} Array of skill info objects
 */
async function scanSkillsDir(skillsDir, scope) {
  const skills = []
  if (!await fs.pathExists(skillsDir)) return skills

  const entries = await fs.readdir(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    if (entry.name.startsWith('@')) {
      // Scoped: @scope/name/
      const scopeDir = path.join(skillsDir, entry.name)
      const scopeEntries = await fs.readdir(scopeDir, { withFileTypes: true })

      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue
        const skill = await readSkillManifest(
          path.join(scopeDir, scopeEntry.name),
          `${entry.name}/${scopeEntry.name}`,
          scope
        )
        if (skill) skills.push(skill)
      }
    } else {
      const skill = await readSkillManifest(
        path.join(skillsDir, entry.name),
        entry.name,
        scope
      )
      if (skill) skills.push(skill)
    }
  }

  return skills
}

class SkillIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('Skill')
  }

  /**
   * Register all skill IPC handlers.
   * @param {Electron.IpcMain} ipcMain
   */
  register(ipcMain) {
    // List all installed skills from both workspace and user directories
    ipcMain.handle('skill:list', async (_event, workspacePath) => {
      try {
        const skills = []

        // Scan user-level (global) skills: ~/.prompd/skills/
        const userSkillsDir = path.join(os.homedir(), '.prompd', 'skills')
        const userSkills = await scanSkillsDir(userSkillsDir, 'user')
        skills.push(...userSkills)

        // Scan workspace-level (local) skills: <workspace>/.prompd/skills/
        if (workspacePath) {
          const wsSkillsDir = path.join(workspacePath, '.prompd', 'skills')
          const wsSkills = await scanSkillsDir(wsSkillsDir, 'workspace')
          skills.push(...wsSkills)
        }

        console.log('[Skill IPC] Found', skills.length, 'installed skills')
        return { success: true, skills }
      } catch (err) {
        console.error('[Skill IPC] list error:', err.message)
        return { success: false, error: err.message, skills: [] }
      }
    })

    console.log('[Skill IPC] Registered 1 handler')
  }
}

module.exports = { SkillIpcRegistration }
