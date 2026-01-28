import express from 'express'
import Joi from 'joi'
import { ProjectService } from '../services/ProjectService.js'
import { auth } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = express.Router()
const projectService = new ProjectService()

// Rate limiting for project operations
const projectRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many project requests'
})

// Validation schemas
const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  initialContent: Joi.string().max(10 * 1024 * 1024).optional(), // 10MB
  settings: Joi.object({
    defaultProvider: Joi.string().valid('openai', 'anthropic', 'azure', 'ollama', 'custom').optional(),
    defaultModel: Joi.string().max(100).optional(),
    compilationFormat: Joi.string().valid('markdown', 'openai-json', 'anthropic-json').optional(),
    autoSave: Joi.boolean().optional(),
    autoCompile: Joi.boolean().optional(),
    collaborationEnabled: Joi.boolean().optional()
  }).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  isPublic: Joi.boolean().optional()
})

const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  settings: Joi.object({
    defaultProvider: Joi.string().valid('openai', 'anthropic', 'azure', 'ollama', 'custom').optional(),
    defaultModel: Joi.string().max(100).optional(),
    compilationFormat: Joi.string().valid('markdown', 'openai-json', 'anthropic-json').optional(),
    autoSave: Joi.boolean().optional(),
    autoCompile: Joi.boolean().optional(),
    collaborationEnabled: Joi.boolean().optional()
  }).optional(),
  metadata: Joi.object({
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }).optional(),
  isPublic: Joi.boolean().optional()
})

const addFileSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  path: Joi.string().min(1).max(500).required(),
  content: Joi.string().max(10 * 1024 * 1024).required(), // 10MB limit
  type: Joi.string().valid('prmd', 'pdflow', 'json', 'yaml', 'md', 'txt', 'other').required()
})

const updateFileSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  content: Joi.string().max(10 * 1024 * 1024).optional()
})

const shareProjectSchema = Joi.object({
  userIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).min(1).max(10).required(),
  role: Joi.string().valid('viewer', 'editor').default('viewer')
})

const addPackageSchema = Joi.object({
  name: Joi.string().pattern(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/).required(),
  version: Joi.string().required(),
  source: Joi.string().valid('registry', 'local', 'git').default('registry')
})

// Apply middleware to all routes
router.use(projectRateLimit)
router.use(auth)

/**
 * GET /api/projects
 * List user's projects
 */
router.get('/', async (req, res, next) => {
  try {
    const options = {
      includeArchived: req.query.includeArchived === 'true',
      includeCollaborated: req.query.includeCollaborated !== 'false',
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
      skip: parseInt(req.query.skip) || 0,
      sortBy: req.query.sortBy || 'updatedAt',
      sortOrder: req.query.sortOrder || 'desc'
    }

    const result = await projectService.getUserProjects(req.user._id, options)

    res.json({
      success: true,
      data: {
        projects: result.projects,
        pagination: {
          total: result.total,
          limit: options.limit,
          skip: options.skip,
          hasMore: result.hasMore
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects
 * Create new project
 */
router.post('/', validate(createProjectSchema), async (req, res, next) => {
  try {
    const project = await projectService.createProject(req.user._id, req.body)

    res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/projects/public
 * Get public projects
 */
router.get('/public', async (req, res, next) => {
  try {
    const options = {
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      skip: parseInt(req.query.skip) || 0,
      tags: req.query.tags ? req.query.tags.split(',') : [],
      search: req.query.search || ''
    }

    const result = await projectService.getPublicProjects(options)

    res.json({
      success: true,
      data: {
        projects: result.projects,
        pagination: {
          total: result.total,
          limit: options.limit,
          skip: options.skip,
          hasMore: result.hasMore
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/projects/:id
 * Get specific project
 */
router.get('/:id', async (req, res, next) => {
  try {
    const project = await projectService.getProject(req.params.id, req.user._id)

    res.json({
      success: true,
      data: project
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/projects/:id
 * Update project
 */
router.put('/:id', validate(updateProjectSchema), async (req, res, next) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body, req.user._id)

    res.json({
      success: true,
      data: project,
      message: 'Project updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/projects/:id
 * Delete project
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await projectService.deleteProject(req.params.id, req.user._id)

    res.json({
      success: true,
      data: result,
      message: 'Project deleted successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects/:id/duplicate
 * Duplicate project
 */
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const newName = req.body.name || null
    const duplicate = await projectService.duplicateProject(req.params.id, newName, req.user._id)

    res.status(201).json({
      success: true,
      data: duplicate,
      message: 'Project duplicated successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/projects/:id/archive
 * Archive/unarchive project
 */
router.put('/:id/archive', async (req, res, next) => {
  try {
    const archived = req.body.archived === true
    const result = await projectService.archiveProject(req.params.id, archived, req.user._id)

    res.json({
      success: true,
      data: result,
      message: `Project ${archived ? 'archived' : 'unarchived'} successfully`
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects/:id/files
 * Add file to project
 */
router.post('/:id/files', validate(addFileSchema), async (req, res, next) => {
  try {
    const file = await projectService.addFile(req.params.id, req.body, req.user._id)

    res.status(201).json({
      success: true,
      data: file,
      message: 'File added successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/projects/:id/files/*
 * Update file in project
 */
router.put('/:id/files/*', validate(updateFileSchema), async (req, res, next) => {
  try {
    const filePath = '/' + req.params[0] // Get the wildcard path
    const file = await projectService.updateFile(req.params.id, filePath, req.body, req.user._id)

    res.json({
      success: true,
      data: file,
      message: 'File updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/projects/:id/files/*
 * Remove file from project
 */
router.delete('/:id/files/*', async (req, res, next) => {
  try {
    const filePath = '/' + req.params[0] // Get the wildcard path
    const result = await projectService.removeFile(req.params.id, filePath, req.user._id)

    res.json({
      success: true,
      data: result,
      message: 'File removed successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects/:id/packages
 * Add package to project
 */
router.post('/:id/packages', validate(addPackageSchema), async (req, res, next) => {
  try {
    const packageData = await projectService.addPackage(req.params.id, req.body, req.user._id)

    res.status(201).json({
      success: true,
      data: packageData,
      message: 'Package added successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/projects/:id/packages/:name
 * Remove package from project
 */
router.delete('/:id/packages/:name', async (req, res, next) => {
  try {
    const result = await projectService.removePackage(req.params.id, req.params.name, req.user._id)

    res.json({
      success: true,
      data: result,
      message: 'Package removed successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects/:id/share
 * Share project with users
 */
router.post('/:id/share', validate(shareProjectSchema), async (req, res, next) => {
  try {
    const collaborators = await projectService.shareProject(
      req.params.id,
      req.body.userIds,
      req.body.role,
      req.user._id
    )

    res.json({
      success: true,
      data: collaborators,
      message: 'Project shared successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/projects/:id/collaborators/:userId
 * Remove collaborator from project
 */
router.delete('/:id/collaborators/:userId', async (req, res, next) => {
  try {
    const result = await projectService.removeCollaborator(
      req.params.id,
      req.params.userId,
      req.user._id
    )

    res.json({
      success: true,
      data: result,
      message: 'Collaborator removed successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router