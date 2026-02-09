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
      { id: 'planner', file: 'planner.json' }
    ]

    for (const { id, file } of modeFiles) {
      const filePath = path.join(PROMPTS_DIR, file)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const config = JSON.parse(content)

        // Load external system prompt file if specified
        if (config.systemPromptFile) {
          const promptFilePath = path.join(PROMPTS_DIR, config.systemPromptFile)
          config.systemPrompt = await fs.readFile(promptFilePath, 'utf-8')
          delete config.systemPromptFile
        }

        modes[id] = config
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

    const content = await fs.readFile(filePath, 'utf-8')
    const mode = JSON.parse(content)

    // Load external system prompt file if specified
    if (mode.systemPromptFile) {
      const promptFilePath = path.join(PROMPTS_DIR, mode.systemPromptFile)
      mode.systemPrompt = await fs.readFile(promptFilePath, 'utf-8')
      delete mode.systemPromptFile
    }

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
