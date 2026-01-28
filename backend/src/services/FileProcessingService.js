import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import mammoth from 'mammoth'
import XLSX from 'xlsx'

// PDF parsing and image processing temporarily disabled due to dependency issues
let pdfParse = null
let sharp = null

export class FileProcessingService {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads')
    this.cacheDir = path.join(process.cwd(), 'cache', 'files')
    this.ensureDirectories()
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true })
      await fs.mkdir(this.cacheDir, { recursive: true })
    } catch (error) {
      console.warn('Failed to create directories:', error.message)
    }
  }

  /**
   * Process uploaded file
   */
  async processUpload(file, options = {}) {
    try {
      const {
        userId,
        projectId,
        extractContent = false,
        preserveOriginal = true
      } = options

      // Generate unique file ID
      const fileId = this.generateFileId(file)
      const fileExtension = path.extname(file.originalname)
      const storedPath = path.join(this.uploadDir, `${fileId}${fileExtension}`)

      // Move file to permanent location
      if (preserveOriginal) {
        await fs.copyFile(file.path, storedPath)
      } else {
        await fs.rename(file.path, storedPath)
      }

      // Get file stats
      const stats = await fs.stat(storedPath)

      // Extract content if requested
      let extractedContent = null
      if (extractContent) {
        try {
          extractedContent = await this.extractContent(fileId, userId, {
            format: 'text',
            preserveFormatting: false
          })
        } catch (error) {
          console.warn('Content extraction failed:', error.message)
        }
      }

      // Store file metadata
      const fileMetadata = {
        id: fileId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: stats.size,
        uploadedAt: new Date(),
        userId,
        projectId,
        storedPath,
        checksum: await this.calculateChecksum(storedPath)
      }

      // Save metadata to cache
      await this.saveFileMetadata(fileId, fileMetadata)

      return {
        success: true,
        fileId,
        originalName: file.originalname,
        size: stats.size,
        mimeType: file.mimetype,
        uploadedAt: fileMetadata.uploadedAt,
        ...(extractedContent && { extractedContent })
      }
    } catch (error) {
      console.error('File processing error:', error)
      throw new Error(`Failed to process file: ${error.message}`)
    }
  }

  /**
   * Extract content from file
   */
  async extractContent(fileId, userId, options = {}) {
    try {
      const {
        format = 'text',
        preserveFormatting = false,
        extractImages = false,
        extractTables = true,
        maxPages = null
      } = options

      // Get file metadata
      const metadata = await this.getFileMetadata(fileId)
      if (!metadata || metadata.userId !== userId) {
        throw new Error('File not found or access denied')
      }

      // Check cache first
      const cacheKey = this.getCacheKey(fileId, options)
      const cached = await this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      let result = null

      switch (metadata.mimeType) {
        case 'application/pdf':
          result = await this.extractPdfContent(metadata.storedPath, options)
          break

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          result = await this.extractWordContent(metadata.storedPath, options)
          break

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel':
          result = await this.extractExcelContent(metadata.storedPath, options)
          break

        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        case 'application/vnd.ms-powerpoint':
          result = await this.extractPowerPointContent(metadata.storedPath, options)
          break

        case 'text/plain':
        case 'text/csv':
          result = await this.extractTextContent(metadata.storedPath, options)
          break

        case 'application/json':
          result = await this.extractJsonContent(metadata.storedPath, options)
          break

        case 'image/jpeg':
        case 'image/png':
        case 'image/gif':
        case 'image/webp':
        case 'image/bmp':
        case 'image/tiff':
          result = await this.extractImageContent(metadata.storedPath, options)
          break

        default:
          throw new Error(`Unsupported file type: ${metadata.mimeType}`)
      }

      // Cache the result
      await this.setCache(cacheKey, result)

      return result
    } catch (error) {
      console.error('Content extraction error:', error)
      throw new Error(`Failed to extract content: ${error.message}`)
    }
  }

  /**
   * Extract PDF content
   */
  async extractPdfContent(filePath, options) {
    try {
      // Try to load PDF parser dynamically
      if (!pdfParse) {
        try {
          pdfParse = await import('pdf-parse')
        } catch (importError) {
          throw new Error('PDF parsing not available - pdf-parse library not installed')
        }
      }
      
      const buffer = await fs.readFile(filePath)
      const data = await (pdfParse.default || pdfParse)(buffer)

      let content = data.text
      
      if (options.maxPages && data.numpages > options.maxPages) {
        // This is simplified - in practice you'd need to parse page by page
        content = content.substring(0, content.length * (options.maxPages / data.numpages))
      }

      const result = {
        content,
        format: options.format,
        metadata: {
          pages: data.numpages,
          info: data.info || {},
          extractedAt: new Date().toISOString()
        }
      }

      if (options.format === 'structured') {
        result.structured = {
          title: data.info?.Title || '',
          author: data.info?.Author || '',
          pages: data.numpages,
          text: content
        }
      }

      return result
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract Word document content
   */
  async extractWordContent(filePath, options) {
    try {
      const buffer = await fs.readFile(filePath)
      const result = await mammoth.extractRawText(buffer)

      const content = options.preserveFormatting 
        ? (await mammoth.convertToHtml(buffer)).value
        : result.value

      return {
        content,
        format: options.format,
        metadata: {
          warnings: result.messages || [],
          extractedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error(`Word document extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract Excel content
   */
  async extractExcelContent(filePath, options) {
    try {
      const workbook = XLSX.readFile(filePath)
      const sheets = {}
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName]
        
        if (options.format === 'json') {
          sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet)
        } else {
          sheets[sheetName] = XLSX.utils.sheet_to_csv(worksheet)
        }
      })

      let content
      if (options.format === 'json') {
        content = JSON.stringify(sheets, null, 2)
      } else {
        content = Object.values(sheets).join('\n\n---\n\n')
      }

      return {
        content,
        format: options.format,
        sheets: Object.keys(sheets),
        metadata: {
          sheetCount: workbook.SheetNames.length,
          sheetNames: workbook.SheetNames,
          extractedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error(`Excel extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract PowerPoint content
   */
  async extractPowerPointContent(filePath, options) {
    try {
      // PowerPoint extraction is complex and would require additional libraries
      // For now, return a placeholder
      return {
        content: 'PowerPoint content extraction not yet implemented',
        format: options.format,
        metadata: {
          extractedAt: new Date().toISOString(),
          note: 'PowerPoint extraction requires additional implementation'
        }
      }
    } catch (error) {
      throw new Error(`PowerPoint extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract text content
   */
  async extractTextContent(filePath, options) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')

      return {
        content,
        format: options.format,
        metadata: {
          encoding: 'utf-8',
          lines: content.split('\n').length,
          extractedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract JSON content
   */
  async extractJsonContent(filePath, options) {
    try {
      const rawContent = await fs.readFile(filePath, 'utf-8')
      const jsonData = JSON.parse(rawContent)

      let content
      if (options.format === 'json') {
        content = JSON.stringify(jsonData, null, 2)
      } else {
        content = this.jsonToText(jsonData)
      }

      return {
        content,
        format: options.format,
        metadata: {
          objectType: Array.isArray(jsonData) ? 'array' : typeof jsonData,
          extractedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error(`JSON extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract image content (metadata and text if OCR available)
   */
  async extractImageContent(filePath, options) {
    try {
      // Try to load Sharp dynamically
      if (!sharp) {
        try {
          sharp = await import('sharp')
        } catch (importError) {
          // Fallback to basic file info if Sharp not available
          const stats = await fs.stat(filePath)
          return {
            content: `Image file: ${path.basename(filePath)} (${this.formatFileSize(stats.size)})`,
            format: options.format,
            metadata: {
              size: stats.size,
              filename: path.basename(filePath),
              extension: path.extname(filePath)
            }
          }
        }
      }

      const sharpInstance = sharp.default || sharp
      const metadata = await sharpInstance(filePath).metadata()

      // For now, just return image metadata
      // OCR would require additional libraries like tesseract.js
      return {
        content: `Image: ${metadata.width}x${metadata.height} ${metadata.format}`,
        format: options.format,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: metadata.size,
          density: metadata.density,
          extractedAt: new Date().toISOString(),
          note: 'OCR text extraction not yet implemented'
        }
      }
    } catch (error) {
      throw new Error(`Image extraction failed: ${error.message}`)
    }
  }

  /**
   * Get file metadata
   */
  async getFile(fileId, userId) {
    try {
      const metadata = await this.getFileMetadata(fileId)
      if (!metadata || metadata.userId !== userId) {
        return null
      }

      return metadata
    } catch (error) {
      console.error('Get file error:', error)
      return null
    }
  }

  /**
   * Get file stream
   */
  async getFileStream(fileId, userId) {
    try {
      const metadata = await this.getFileMetadata(fileId)
      if (!metadata || metadata.userId !== userId) {
        throw new Error('File not found or access denied')
      }

      const { createReadStream } = await import('fs')
      return createReadStream(metadata.storedPath)
    } catch (error) {
      console.error('Get file stream error:', error)
      throw error
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId, userId) {
    try {
      const metadata = await this.getFileMetadata(fileId)
      if (!metadata || metadata.userId !== userId) {
        throw new Error('File not found or access denied')
      }

      // Delete physical file
      try {
        await fs.unlink(metadata.storedPath)
      } catch (error) {
        console.warn('Failed to delete physical file:', error.message)
      }

      // Delete metadata
      await this.deleteFileMetadata(fileId)

      // Clear related cache
      await this.clearFileCache(fileId)

      return {
        fileId,
        deleted: true,
        message: 'File deleted successfully'
      }
    } catch (error) {
      console.error('Delete file error:', error)
      throw error
    }
  }

  /**
   * Get user files
   */
  async getUserFiles(userId, options = {}) {
    try {
      // This is a simplified implementation
      // In production, you'd use a proper database
      const files = []
      const total = files.length

      return {
        files,
        total,
        hasMore: false
      }
    } catch (error) {
      console.error('Get user files error:', error)
      throw error
    }
  }

  /**
   * Get supported file types
   */
  async getSupportedTypes() {
    return {
      documents: [
        {
          mimeType: 'application/pdf',
          extension: '.pdf',
          name: 'PDF Document',
          maxSize: '50MB',
          features: ['text_extraction', 'metadata']
        },
        {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          extension: '.docx',
          name: 'Word Document',
          maxSize: '50MB',
          features: ['text_extraction', 'formatting']
        },
        {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: '.xlsx',
          name: 'Excel Spreadsheet',
          maxSize: '50MB',
          features: ['data_extraction', 'multiple_sheets']
        }
      ],
      images: [
        {
          mimeType: 'image/jpeg',
          extension: '.jpg',
          name: 'JPEG Image',
          maxSize: '10MB',
          features: ['metadata', 'resize']
        },
        {
          mimeType: 'image/png',
          extension: '.png',
          name: 'PNG Image',
          maxSize: '10MB',
          features: ['metadata', 'resize']
        }
      ],
      text: [
        {
          mimeType: 'text/plain',
          extension: '.txt',
          name: 'Text File',
          maxSize: '10MB',
          features: ['direct_content']
        },
        {
          mimeType: 'application/json',
          extension: '.json',
          name: 'JSON File',
          maxSize: '10MB',
          features: ['structured_data']
        }
      ]
    }
  }

  /**
   * Analyze file for content insights
   */
  async analyzeFile(file, options = {}) {
    try {
      // Basic file analysis
      const stats = await fs.stat(file.path)
      
      const analysis = {
        success: true,
        fileName: file.originalname,
        fileSize: stats.size,
        mimeType: file.mimetype,
        analyzedAt: new Date().toISOString()
      }

      if (options.includeStatistics) {
        analysis.statistics = {
          sizeInKB: Math.round(stats.size / 1024),
          sizeInMB: Math.round(stats.size / (1024 * 1024))
        }
      }

      // Basic content analysis for text files
      if (file.mimetype.startsWith('text/')) {
        const content = await fs.readFile(file.path, 'utf-8')
        analysis.contentAnalysis = {
          lineCount: content.split('\n').length,
          wordCount: content.split(/\s+/).length,
          characterCount: content.length
        }

        if (options.extractKeywords) {
          analysis.keywords = this.extractKeywords(content)
        }
      }

      return analysis
    } catch (error) {
      return {
        success: false,
        fileName: file.originalname,
        error: error.message
      }
    }
  }

  /**
   * Convert file to different format
   */
  async convertFile(fileId, userId, targetFormat, options = {}) {
    try {
      const metadata = await this.getFileMetadata(fileId)
      if (!metadata || metadata.userId !== userId) {
        throw new Error('File not found or access denied')
      }

      // This is a placeholder implementation
      // Real conversion would require format-specific libraries
      return {
        originalFileId: fileId,
        targetFormat,
        status: 'conversion_not_implemented',
        message: 'File conversion requires additional implementation'
      }
    } catch (error) {
      console.error('File conversion error:', error)
      throw error
    }
  }

  /**
   * Helper methods
   */

  generateFileId(file) {
    const hash = crypto.createHash('sha256')
    hash.update(file.originalname + Date.now().toString())
    return hash.digest('hex').substring(0, 16)
  }

  async calculateChecksum(filePath) {
    try {
      const buffer = await fs.readFile(filePath)
      return crypto.createHash('sha256').update(buffer).digest('hex')
    } catch (error) {
      return null
    }
  }

  getCacheKey(fileId, options) {
    return `extract:${fileId}:${crypto.createHash('md5').update(JSON.stringify(options)).digest('hex')}`
  }

  async saveFileMetadata(fileId, metadata) {
    try {
      const metadataPath = path.join(this.cacheDir, `${fileId}.json`)
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    } catch (error) {
      console.warn('Failed to save file metadata:', error.message)
    }
  }

  async getFileMetadata(fileId) {
    try {
      const metadataPath = path.join(this.cacheDir, `${fileId}.json`)
      const data = await fs.readFile(metadataPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      return null
    }
  }

  async deleteFileMetadata(fileId) {
    try {
      const metadataPath = path.join(this.cacheDir, `${fileId}.json`)
      await fs.unlink(metadataPath)
    } catch (error) {
      console.warn('Failed to delete file metadata:', error.message)
    }
  }

  async getFromCache(cacheKey) {
    try {
      const cachePath = path.join(this.cacheDir, `cache_${cacheKey}.json`)
      const data = await fs.readFile(cachePath, 'utf-8')
      const cached = JSON.parse(data)
      
      // Check if cache is still valid (24 hours)
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return cached.data
      }
      
      await fs.unlink(cachePath).catch(() => {})
      return null
    } catch (error) {
      return null
    }
  }

  async setCache(cacheKey, data) {
    try {
      const cachePath = path.join(this.cacheDir, `cache_${cacheKey}.json`)
      const cacheData = {
        data,
        timestamp: Date.now()
      }
      await fs.writeFile(cachePath, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to set cache:', error.message)
    }
  }

  async clearFileCache(fileId) {
    try {
      const files = await fs.readdir(this.cacheDir)
      const cacheFiles = files.filter(file => file.includes(fileId))
      
      await Promise.all(
        cacheFiles.map(file => 
          fs.unlink(path.join(this.cacheDir, file)).catch(() => {})
        )
      )
    } catch (error) {
      console.warn('Failed to clear file cache:', error.message)
    }
  }

  jsonToText(obj, indent = 0) {
    const spaces = '  '.repeat(indent)
    let result = ''

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        result += `${spaces}[${index}]: ${this.jsonToText(item, indent + 1)}\n`
      })
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        result += `${spaces}${key}: ${this.jsonToText(value, indent + 1)}\n`
      })
    } else {
      result = String(obj)
    }

    return result
  }

  extractKeywords(text) {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)

    const frequency = {}
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1
    })

    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word)
  }
}