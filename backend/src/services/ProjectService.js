import { Project } from '../models/Project.js'
import { User } from '../models/User.js'
import crypto from 'crypto'

export class ProjectService {
  /**
   * Create a new project
   */
  async createProject(userId, projectData) {
    try {
      // Validate user exists and can create projects
      const user = await User.findById(userId)
      if (!user) {
        throw new Error('User not found')
      }

      const canCreate = await user.canPerformAction('create_project')
      if (!canCreate) {
        const maxProjects = user.subscription.features.maxProjects
        throw new Error(`Project limit reached. You can have a maximum of ${maxProjects} projects. Please delete or archive an existing project to create a new one.`)
      }

      // Create project with default structure
      const project = new Project({
        name: projectData.name,
        description: projectData.description || '',
        userId,
        files: projectData.files || [],
        settings: {
          ...projectData.settings,
          defaultProvider: projectData.settings?.defaultProvider || 'openai',
          defaultModel: projectData.settings?.defaultModel || 'gpt-4o'
        },
        packages: projectData.packages || [],
        metadata: {
          tags: projectData.tags || []
        },
        isPublic: projectData.isPublic || false
      })

      // Add initial files if provided
      if (projectData.initialContent) {
        await project.addFile({
          name: 'main.prmd',
          path: '/main.prmd',
          content: projectData.initialContent,
          type: 'prmd'
        })
      }

      await project.save()

      // Update user statistics
      user.statistics.projectsCreated += 1
      await user.save()

      return project
    } catch (error) {
      console.error('Create project error:', error)
      throw new Error(`Failed to create project: ${error.message}`)
    }
  }

  /**
   * Get project by ID with permission check
   */
  async getProject(projectId, userId) {
    try {
      const project = await Project.findById(projectId)
        .populate('collaborators.userId', 'username email profile')
        .populate('userId', 'username email profile')

      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'viewer')) {
        throw new Error('Access denied')
      }

      return project
    } catch (error) {
      console.error('Get project error:', error)
      throw new Error(`Failed to get project: ${error.message}`)
    }
  }

  /**
   * Update project
   */
  async updateProject(projectId, updates, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      // Update allowed fields
      const allowedFields = ['name', 'description', 'settings', 'metadata', 'isPublic']
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'settings') {
            project.updateSettings(updates[field])
          } else if (field === 'metadata') {
            project.metadata = { ...project.metadata.toObject(), ...updates[field] }
          } else {
            project[field] = updates[field]
          }
        }
      })

      await project.save()
      return project
    } catch (error) {
      console.error('Update project error:', error)
      throw new Error(`Failed to update project: ${error.message}`)
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Only owner can delete
      if (project.userId.toString() !== userId.toString()) {
        throw new Error('Only project owner can delete the project')
      }

      await Project.findByIdAndDelete(projectId)
      return { success: true, message: 'Project deleted successfully' }
    } catch (error) {
      console.error('Delete project error:', error)
      throw new Error(`Failed to delete project: ${error.message}`)
    }
  }

  /**
   * Get user's projects
   */
  async getUserProjects(userId, options = {}) {
    try {
      const {
        includeArchived = false,
        includeCollaborated = true,
        limit = 50,
        skip = 0,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options

      let query = { userId }
      
      if (includeCollaborated) {
        query = {
          $or: [
            { userId },
            { 'collaborators.userId': userId }
          ]
        }
      }

      if (!includeArchived) {
        query.isArchived = { $ne: true }
      }

      const sortOptions = {}
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1

      const projects = await Project.find(query)
        .sort(sortOptions)
        .limit(limit)
        .skip(skip)
        .populate('userId', 'username email profile')
        .populate('collaborators.userId', 'username email profile')

      const total = await Project.countDocuments(query)

      return {
        projects,
        total,
        hasMore: skip + limit < total
      }
    } catch (error) {
      console.error('Get user projects error:', error)
      throw new Error(`Failed to get user projects: ${error.message}`)
    }
  }

  /**
   * Add file to project
   */
  async addFile(projectId, fileData, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      // Validate file data
      this.validateFileData(fileData)

      // Add file
      const file = await project.addFile(fileData)
      await project.save()

      return file
    } catch (error) {
      console.error('Add file error:', error)
      throw new Error(`Failed to add file: ${error.message}`)
    }
  }

  /**
   * Update file in project
   */
  async updateFile(projectId, filePath, updates, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      // Find and update file
      const file = project.files.find(f => f.path === filePath)
      if (!file) {
        throw new Error('File not found')
      }

      // Update allowed fields
      const allowedFields = ['content', 'name']
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          file[field] = updates[field]
        }
      })

      // Update metadata
      file.lastModified = new Date()
      if (updates.content) {
        file.size = Buffer.byteLength(updates.content, 'utf8')
        file.checksum = crypto.createHash('sha256').update(updates.content).digest('hex')
      }

      await project.save()
      return file
    } catch (error) {
      console.error('Update file error:', error)
      throw new Error(`Failed to update file: ${error.message}`)
    }
  }

  /**
   * Remove file from project
   */
  async removeFile(projectId, filePath, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      const removed = project.removeFile(filePath)
      if (!removed) {
        throw new Error('File not found')
      }

      await project.save()
      return { success: true, message: 'File removed successfully' }
    } catch (error) {
      console.error('Remove file error:', error)
      throw new Error(`Failed to remove file: ${error.message}`)
    }
  }

  /**
   * Add package to project
   */
  async addPackage(projectId, packageInfo, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      // Validate package info
      this.validatePackageInfo(packageInfo)

      const packageData = project.addPackage(packageInfo)
      await project.save()

      return packageData
    } catch (error) {
      console.error('Add package error:', error)
      throw new Error(`Failed to add package: ${error.message}`)
    }
  }

  /**
   * Remove package from project
   */
  async removePackage(projectId, packageName, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to edit project')
      }

      const removed = project.removePackage(packageName)
      if (!removed) {
        throw new Error('Package not found in project')
      }

      await project.save()
      return { success: true, message: 'Package removed successfully' }
    } catch (error) {
      console.error('Remove package error:', error)
      throw new Error(`Failed to remove package: ${error.message}`)
    }
  }

  /**
   * Share project with users
   */
  async shareProject(projectId, userIds, role = 'viewer', userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Only owner can share projects
      if (project.userId.toString() !== userId.toString()) {
        throw new Error('Only project owner can share the project')
      }

      // Validate users exist
      const users = await User.find({ _id: { $in: userIds } })
      if (users.length !== userIds.length) {
        throw new Error('One or more users not found')
      }

      // Add collaborators
      userIds.forEach(collaboratorId => {
        // Remove existing collaboration if any
        project.collaborators = project.collaborators.filter(
          c => c.userId.toString() !== collaboratorId.toString()
        )

        // Add new collaboration
        project.collaborators.push({
          userId: collaboratorId,
          role,
          addedAt: new Date()
        })
      })

      await project.save()
      return project.collaborators
    } catch (error) {
      console.error('Share project error:', error)
      throw new Error(`Failed to share project: ${error.message}`)
    }
  }

  /**
   * Remove collaborator from project
   */
  async removeCollaborator(projectId, collaboratorId, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Only owner can remove collaborators
      if (project.userId.toString() !== userId.toString()) {
        throw new Error('Only project owner can remove collaborators')
      }

      project.collaborators = project.collaborators.filter(
        c => c.userId.toString() !== collaboratorId.toString()
      )

      await project.save()
      return { success: true, message: 'Collaborator removed successfully' }
    } catch (error) {
      console.error('Remove collaborator error:', error)
      throw new Error(`Failed to remove collaborator: ${error.message}`)
    }
  }

  /**
   * Get public projects
   */
  async getPublicProjects(options = {}) {
    try {
      const {
        limit = 20,
        skip = 0,
        tags = [],
        search = ''
      } = options

      let query = { 
        isPublic: true, 
        isArchived: { $ne: true }
      }

      if (tags.length > 0) {
        query['metadata.tags'] = { $in: tags }
      }

      if (search) {
        query.$text = { $search: search }
      }

      const projects = await Project.find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .skip(skip)
        .populate('userId', 'username email profile')
        .select('-files.content') // Don't include file content for performance

      const total = await Project.countDocuments(query)

      return {
        projects,
        total,
        hasMore: skip + limit < total
      }
    } catch (error) {
      console.error('Get public projects error:', error)
      throw new Error(`Failed to get public projects: ${error.message}`)
    }
  }

  /**
   * Archive/unarchive project
   */
  async archiveProject(projectId, archived, userId) {
    try {
      const project = await Project.findById(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!project.hasPermission(userId, 'editor')) {
        throw new Error('Insufficient permissions to archive project')
      }

      project.isArchived = archived
      await project.save()

      return { 
        success: true, 
        message: `Project ${archived ? 'archived' : 'unarchived'} successfully` 
      }
    } catch (error) {
      console.error('Archive project error:', error)
      throw new Error(`Failed to archive project: ${error.message}`)
    }
  }

  /**
   * Duplicate project
   */
  async duplicateProject(projectId, newName, userId) {
    try {
      const originalProject = await Project.findById(projectId)
      if (!originalProject) {
        throw new Error('Project not found')
      }

      // Check permissions
      if (!originalProject.hasPermission(userId, 'viewer')) {
        throw new Error('Access denied')
      }

      // Create duplicate
      const duplicateData = {
        name: newName || `${originalProject.name} (Copy)`,
        description: originalProject.description,
        files: originalProject.files.map(file => ({
          name: file.name,
          path: file.path,
          content: file.content,
          type: file.type
        })),
        settings: originalProject.settings.toObject(),
        packages: originalProject.packages.map(pkg => ({
          name: pkg.name,
          version: pkg.version,
          source: pkg.source
        })),
        tags: originalProject.metadata.tags
      }

      const duplicate = await this.createProject(userId, duplicateData)
      return duplicate
    } catch (error) {
      console.error('Duplicate project error:', error)
      throw new Error(`Failed to duplicate project: ${error.message}`)
    }
  }

  /**
   * Validate file data
   */
  validateFileData(fileData) {
    if (!fileData.name || typeof fileData.name !== 'string') {
      throw new Error('File name is required')
    }

    if (!fileData.path || typeof fileData.path !== 'string') {
      throw new Error('File path is required')
    }

    if (!fileData.content || typeof fileData.content !== 'string') {
      throw new Error('File content is required')
    }

    if (!fileData.type || typeof fileData.type !== 'string') {
      throw new Error('File type is required')
    }

    const validTypes = ['prmd', 'pdflow', 'json', 'yaml', 'md', 'txt', 'other']
    if (!validTypes.includes(fileData.type)) {
      throw new Error(`Invalid file type: ${fileData.type}`)
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (Buffer.byteLength(fileData.content, 'utf8') > maxSize) {
      throw new Error('File content exceeds maximum size limit')
    }
  }

  /**
   * Validate package info
   */
  validatePackageInfo(packageInfo) {
    if (!packageInfo.name || typeof packageInfo.name !== 'string') {
      throw new Error('Package name is required')
    }

    if (!packageInfo.version || typeof packageInfo.version !== 'string') {
      throw new Error('Package version is required')
    }

    const packageNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
    if (!packageNameRegex.test(packageInfo.name)) {
      throw new Error('Invalid package name format')
    }

    const versionRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
    if (packageInfo.version !== 'latest' && !versionRegex.test(packageInfo.version)) {
      throw new Error('Invalid version format')
    }
  }
}