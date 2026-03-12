/**
 * Chat Modes Configuration API
 * Serves chat mode definitions and system prompts
 */

import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load mode configurations from the prompts directory
const PROMPTS_DIR = path.join(__dirname, '../prompts/modes')

/**
 * Load a mode config from JSON, resolve systemPromptFile and includeFiles.
 * - systemPromptFile: main system prompt markdown
 * - includeFiles: array of shared reference files appended to the system prompt
 */
async function loadModeConfig(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
  const config = JSON.parse(content)

  // Load the main system prompt file
  if (config.systemPromptFile) {
    const promptFilePath = path.join(PROMPTS_DIR, config.systemPromptFile)
    config.systemPrompt = await fs.readFile(promptFilePath, 'utf-8')
    delete config.systemPromptFile
  }

  // Merge any shared include files into the system prompt
  if (config.includeFiles && Array.isArray(config.includeFiles)) {
    const includes = []
    for (const includeFile of config.includeFiles) {
      try {
        const includePath = path.join(PROMPTS_DIR, includeFile)
        const includeContent = await fs.readFile(includePath, 'utf-8')
        includes.push(includeContent)
      } catch (err) {
        console.error(`[chatModes] Failed to load include file "${includeFile}":`, err.message)
      }
    }
    if (includes.length > 0 && config.systemPrompt) {
      config.systemPrompt = config.systemPrompt + '\n\n' + includes.join('\n\n')
    }
    delete config.includeFiles
  }

  return config
}

/**
 * GET /api/chat-modes
 * Returns all available chat mode configurations
 */
router.get('/chat-modes', async (req, res) => {
  try {
    // Load all mode configuration files
    const modes = {}

    // Define mode files to load
    // Unified Agent mode handles all intents: create, edit, explore, discuss
    const modeFiles = [
      { id: 'agent', file: 'agent.json' },
      { id: 'planner', file: 'planner.json' },
      { id: 'help-chat', file: 'help-chat.json' },
      { id: 'brainstorm', file: 'brainstorm.json' }
    ]

    for (const { id, file } of modeFiles) {
      const filePath = path.join(PROMPTS_DIR, file)
      try {
        modes[id] = await loadModeConfig(filePath)
      } catch (error) {
        console.error(`Error loading mode ${id}:`, error.message)
        // Continue loading other modes even if one fails
      }
    }

    res.json({
      modes,
      version: '1.0.0',
      lastUpdated: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error loading chat modes:', error)
    res.status(500).json({ error: 'Failed to load chat modes' })
  }
})

/**
 * GET /api/chat-modes/:modeId
 * Returns a specific chat mode configuration
 */
router.get('/chat-modes/:modeId', async (req, res) => {
  try {
    const { modeId } = req.params
    const filePath = path.join(PROMPTS_DIR, `${modeId}.json`)

    const mode = await loadModeConfig(filePath)
    res.json(mode)
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Chat mode not found' })
    } else {
      console.error(`Error loading mode ${req.params.modeId}:`, error)
      res.status(500).json({ error: 'Failed to load chat mode' })
    }
  }
})

export default router
