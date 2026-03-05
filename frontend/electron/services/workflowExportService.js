/**
 * Workflow Export Service - Generate Docker deployment files for workflows
 *
 * Exports a workflow as a self-contained Docker deployment with:
 * - Express server (server.js) with /execute and /webhook endpoints
 * - Dockerfile with all installation commands
 * - docker-compose.yml for easy deployment
 * - package.json with server dependencies
 * - prompd.json with workflow package dependencies (with CLI-generated integrity hashes)
 * - .env.example with API key templates
 * - Workflow file and all referenced prompt files
 *
 * Uses shared packageWorkflow utility to create .pdpkg with integrity hashes,
 * then extracts to export directory and adds deployment files.
 */

const fs = require('fs').promises
const fssync = require('fs')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')
const { packageWorkflow } = require('./packageWorkflow')

/**
 * Extract a ZIP archive with ZIP Slip protection.
 * Throws if any entry would escape the target directory.
 * @param {string} zipPath - Path to the .pdpkg / ZIP file
 * @param {string} targetDir - Directory to extract into
 * @param {boolean} overwrite - Whether to overwrite existing files
 */
function safeExtractZip(zipPath, targetDir, overwrite = false) {
  const zip = new AdmZip(zipPath)
  const resolvedTarget = path.resolve(targetDir)
  for (const entry of zip.getEntries()) {
    if (entry.entryName.endsWith('/')) continue // directory entries are fine
    const resolvedEntry = path.resolve(targetDir, entry.entryName)
    if (!resolvedEntry.startsWith(resolvedTarget + path.sep)) {
      throw new Error(`Security: ZIP entry "${entry.entryName}" would escape target directory`)
    }
  }
  zip.extractAllTo(targetDir, overwrite)
}

class WorkflowExportService {
  constructor(getPrompdCli) {
    this.getPrompdCli = getPrompdCli
  }
  /**
   * Export a workflow (routes to Docker or Kubernetes based on exportType)
   * @param {Object} options
   * @param {Object} options.workflow - The workflow object to export
   * @param {string} options.workflowPath - Path to the workflow file
   * @param {string} options.outputDir - Directory to export to
   * @param {Object} options.prompdjson - Optional prompd.json manifest
   * @param {string} options.exportType - 'docker' or 'kubernetes' (default: 'docker')
   * @param {Object} options.kubernetesOptions - Kubernetes-specific options
   * @returns {Promise<{success: boolean, files: string[], error?: string}>}
   */
  async exportWorkflow(options) {
    const { exportType = 'docker' } = options

    if (exportType === 'kubernetes') {
      return this.exportKubernetes(options)
    } else {
      return this.exportDocker(options)
    }
  }

  /**
   * Export a workflow as a Docker deployment
   * @param {Object} options
   * @param {Object} options.workflow - The workflow object to export
   * @param {string} options.workflowPath - Path to the workflow file
   * @param {string} options.outputDir - Directory to export to
   * @param {Object} options.prompdjson - Optional prompd.json manifest
   * @returns {Promise<{success: boolean, files: string[], error?: string}>}
   */
  async exportDocker(options) {
    const { workflow, workflowPath, outputDir } = options

    try {
      // Derive workflow name from metadata (not the workspace package name)
      const workflowName = workflow.metadata?.name || workflow.name || path.basename(workflowPath, '.pdflow')
      options.name = workflowName

      // Detect providers used in workflow
      const { providers, hasOllama } = this.detectProviders(workflow)

      // Create output directory
      await fs.mkdir(outputDir, { recursive: true })

      // 1. Use shared packaging utility to create .pdpkg with integrity hashes
      console.log('[WorkflowExport] Creating package with integrity hashes...')
      const packageResult = await packageWorkflow(workflowPath, options, this.getPrompdCli)

      if (!packageResult.success) {
        throw new Error(packageResult.error || 'Failed to create package')
      }

      // 2. Extract package to output directory (contains prompd.json with integrity hashes)
      console.log('[WorkflowExport] Extracting package to:', outputDir)
      safeExtractZip(packageResult.packagePath, outputDir, false)

      const generatedFiles = []
      const workflowRelativePath = packageResult.workflowRelativePath
      const workflowFileName = path.basename(workflowRelativePath)

      // Track extracted files from prompd.json
      const prompdJsonPath = path.join(outputDir, 'prompd.json')
      const prompdJson = JSON.parse(await fs.readFile(prompdJsonPath, 'utf-8'))
      generatedFiles.push(...prompdJson.files)

      // 3. Generate deployment files
      // server.js
      const serverPath = path.join(outputDir, 'server.js')
      await fs.writeFile(serverPath, this.generateServerJs(workflow, workflowRelativePath))
      generatedFiles.push('server.js')

      // Dockerfile
      const dockerfilePath = path.join(outputDir, 'Dockerfile')
      await fs.writeFile(dockerfilePath, this.generateDockerfile())
      generatedFiles.push('Dockerfile')

      // docker-compose.yml
      const composePath = path.join(outputDir, 'docker-compose.yml')
      await fs.writeFile(composePath, this.generateDockerCompose(workflow))
      generatedFiles.push('docker-compose.yml')

      // package.json
      const packageJsonPath = path.join(outputDir, 'package.json')
      await fs.writeFile(packageJsonPath, this.generatePackageJson(workflow))
      generatedFiles.push('package.json')

      // .prompd/config.yaml (if Ollama detected)
      if (hasOllama) {
        const prompdDir = path.join(outputDir, '.prompd')
        await fs.mkdir(prompdDir, { recursive: true })

        const configPath = path.join(prompdDir, 'config.yaml')
        await fs.writeFile(configPath, this.generatePrompdConfig(hasOllama))
        generatedFiles.push('.prompd/config.yaml')
      }

      // .env.example (only for detected cloud providers)
      const envExamplePath = path.join(outputDir, '.env.example')
      await fs.writeFile(envExamplePath, this.generateEnvExample(providers, hasOllama))
      generatedFiles.push('.env.example')

      // README.md
      const readmePath = path.join(outputDir, 'README.md')
      await fs.writeFile(readmePath, this.generateReadme(workflow, workflowFileName))
      generatedFiles.push('README.md')

      // 4. Clean up temporary package file
      await fs.unlink(packageResult.packagePath).catch(() => {})

      console.log(`[WorkflowExport] Successfully exported workflow to ${outputDir}`)
      console.log(`[WorkflowExport] Generated ${generatedFiles.length} files`)

      return {
        success: true,
        files: generatedFiles,
        outputDir
      }

    } catch (error) {
      console.error('[WorkflowExport] Export failed:', error)
      return {
        success: false,
        error: error.message,
        files: []
      }
    }
  }

  /**
   * Generate server.js with Express endpoints
   * @param {Object} workflow
   * @param {string} workflowFileName - Actual workflow filename
   * @returns {string}
   */
  generateServerJs(workflow, workflowRelativePath) {
    return `/**
 * Prompd Workflow Server
 *
 * Express server for executing workflows via HTTP endpoints
 *
 * Endpoints:
 *   POST /execute - Execute the workflow
 *   POST /webhook - Webhook trigger endpoint
 *   GET /health - Health check
 *   GET /status - Workflow status
 */

import express from 'express'
import { executeWorkflow } from '@prompd/cli'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json({ limit: '10mb' }))

// Load workflow (preserves workspace structure: e.g., 'workflows/test.pdflow')
const workflowPath = join(__dirname, '${workflowRelativePath}')
let workflowData
try {
  workflowData = JSON.parse(readFileSync(workflowPath, 'utf-8'))
  console.log(\`Loaded workflow: \${workflowData.metadata?.name || workflowData.name || 'Unnamed'}\`)
} catch (error) {
  console.error('Failed to load workflow:', error.message)
  process.exit(1)
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    workflow: workflowData.metadata?.name || workflowData.name || 'Unnamed',
    timestamp: new Date().toISOString()
  })
})

// Workflow status
app.get('/status', (req, res) => {
  res.json({
    workflow: {
      name: workflowData.metadata?.name || workflowData.name || 'Unnamed',
      description: workflowData.metadata?.description || workflowData.description || '',
      nodeCount: workflowData.nodes?.length || 0
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'production'
    }
  })
})

// Execute workflow
app.post('/execute', async (req, res) => {
  const { parameters = {} } = req.body

  console.log(\`[Execute] Starting workflow with parameters:\`, parameters)

  try {
    const result = await executeWorkflow(workflowData, parameters, {
      workingDirectory: __dirname,
      packagePath: __dirname,
      onNodeStart: (nodeId) => {
        console.log(\`[Execute] Node start: \${nodeId}\`)
      },
      onNodeComplete: (nodeId, output) => {
        console.log(\`[Execute] Node complete: \${nodeId}\`)
      },
      onError: (error) => {
        console.error(\`[Execute] Error:\`, error.message)
      }
    })

    res.json({
      success: result.success,
      result: result.output,
      duration: result.endTime - result.startTime,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Execute] Workflow execution failed:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Webhook trigger endpoint
app.post('/webhook', async (req, res) => {
  const { payload = {} } = req.body

  console.log(\`[Webhook] Triggered with payload:\`, payload)

  // Acknowledge receipt immediately
  res.status(202).json({
    message: 'Webhook received, execution queued',
    timestamp: new Date().toISOString()
  })

  // Execute workflow asynchronously
  try {
    const result = await executeWorkflow(workflowData, {
      _trigger: {
        type: 'webhook',
        payload,
        triggeredAt: Date.now()
      },
      ...payload
    }, {
      workingDirectory: __dirname,
      packagePath: __dirname
    })

    console.log(\`[Webhook] Execution completed:\`, result.success ? 'success' : 'failed')

  } catch (error) {
    console.error('[Webhook] Execution failed:', error.message)
  }
})

// Start server
app.listen(PORT, () => {
  console.log(\`Prompd Workflow Server running on port \${PORT}\`)
  console.log(\`Workflow: \${workflowData.metadata?.name || workflowData.name || 'Unnamed'}\`)
  console.log('Endpoints:')
  console.log(\`  POST http://localhost:\${PORT}/execute\`)
  console.log(\`  POST http://localhost:\${PORT}/webhook\`)
  console.log(\`  GET  http://localhost:\${PORT}/health\`)
  console.log(\`  GET  http://localhost:\${PORT}/status\`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})
`
  }

  /**
   * Generate Dockerfile with all installation commands
   * @returns {string}
   */
  generateDockerfile() {
    return `# Multi-stage Dockerfile for Prompd Workflow Deployment
# Stage 1: Build and install dependencies
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY prompd.json ./

# Install dependencies
RUN npm install

# Install @prompd/cli globally
RUN npm install -g @prompd/cli

# Install workflow package dependencies
RUN prompd install || echo "No package dependencies to install"

# Stage 2: Production runtime
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /usr/local/lib/node_modules/@prompd /usr/local/lib/node_modules/@prompd
COPY --from=builder /usr/local/bin/prompd /usr/local/bin/prompd

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Run server
CMD ["node", "server.js"]
`
  }

  /**
   * Generate docker-compose.yml for easy deployment
   * @param {Object} workflow
   * @returns {string}
   */
  generateDockerCompose(workflow) {
    const workflowName = workflow.metadata?.name || workflow.name || 'prompd-workflow'
    const serviceName = workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    return `version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      # API Keys (set in .env file)
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}
      - GOOGLE_API_KEY=\${GOOGLE_API_KEY}
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    volumes:
      # Mount workflow files for hot-reload during development
      - ./workflow.pdflow:/app/workflow.pdflow:ro
      - ./prompts:/app/prompts:ro
`
  }

  /**
   * Generate package.json with server dependencies
   * @param {Object} workflow
   * @returns {string}
   */
  generatePackageJson(workflow) {
    const workflowName = workflow.metadata?.name || workflow.name || 'prompd-workflow'
    const imageName = workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    return JSON.stringify({
      name: imageName,
      version: '1.0.0',
      description: workflow.metadata?.description || workflow.description || 'Prompd workflow deployment',
      type: 'module',
      main: 'server.js',
      scripts: {
        start: 'node server.js',
        dev: 'node --watch server.js',
        'docker:build': `docker build -t ${imageName} .`,
        'docker:run': `docker run -p 3000:3000 --env-file .env ${imageName}`,
        'docker:compose': 'docker-compose up -d',
        'docker:logs': 'docker-compose logs -f',
        'docker:stop': 'docker-compose down'
      },
      dependencies: {
        express: '^4.18.2',
        '@prompd/cli': 'latest'
      },
      engines: {
        node: '>=18.0.0'
      }
    }, null, 2)
  }

  /**
   * Generate prompd.json manifest from workflow
   * Uses same format as local deployment (main.js:4015-4023)
   * @param {Object} workflow - The workflow object
   * @param {string} workflowFileName - The workflow filename
   * @param {string[]} files - List of files to include in manifest
   * @param {Object} fileHashes - Map of file paths to SHA256 hashes
   * @returns {string}
   */
  /**
   * Generate .env.example with API key templates (only for detected providers)
   * @param {Set<string>} providers - Detected cloud providers
   * @param {boolean} hasOllama - Whether Ollama is detected
   * @returns {string}
   */
  generateEnvExample(providers = new Set(), hasOllama = false) {
    let content = `# Prompd Workflow Environment Variables

# Server Configuration
PORT=3000
NODE_ENV=production

`

    // Only include API keys for detected cloud providers
    if (providers.size > 0) {
      content += `# LLM API Keys (detected providers in workflow)\n`

      const providerKeyMap = {
        'openai': 'OPENAI_API_KEY=sk-...',
        'anthropic': 'ANTHROPIC_API_KEY=sk-ant-...',
        'google': 'GOOGLE_API_KEY=...',
        'cohere': 'COHERE_API_KEY=...',
        'replicate': 'REPLICATE_API_KEY=...',
        'huggingface': 'HUGGINGFACE_API_KEY=...',
      }

      for (const provider of providers) {
        if (providerKeyMap[provider]) {
          content += `${providerKeyMap[provider]}\n`
        }
      }

      content += '\n'
    }

    // Add note about Ollama if detected
    if (hasOllama) {
      content += `# Ollama (local models - no API key needed)
# Configuration is in .prompd/config.yaml
# Ensure Ollama is running on http://localhost:11434

`
    }

    // Always include optional sections
    content += `# Optional: Registry configuration
PROMPD_REGISTRY_URL=https://registry.prompdhub.ai
PROMPD_REGISTRY_TOKEN=...

# Optional: Logging
LOG_LEVEL=info
`

    return content
  }

  /**
   * Generate README.md with deployment instructions
   * @param {Object} workflow
   * @param {string} workflowFileName
   * @returns {string}
   */
  generateReadme(workflow, workflowFileName) {
    const workflowName = workflow.metadata?.name || workflow.name || 'Prompd Workflow'
    const serviceName = workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    return `# ${workflowName} - Deployment

${workflow.metadata?.description || workflow.description || 'Docker deployment for Prompd workflow'}

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- API keys for LLM providers used in the workflow

### Setup

1. **Configure environment variables:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env and add your API keys
   \`\`\`

2. **Build and run with Docker Compose:**
   \`\`\`bash
   docker-compose up -d
   \`\`\`

3. **Check health:**
   \`\`\`bash
   curl http://localhost:3000/health
   \`\`\`

### Alternative: Docker Build

\`\`\`bash
# Build image
docker build -t ${serviceName} .

# Run container
docker run -p 3000:3000 --env-file .env ${serviceName}
\`\`\`

## API Endpoints

### Execute Workflow
\`\`\`bash
POST http://localhost:3000/execute

{
  "parameters": {
    "input": "your input here"
  }
}
\`\`\`

### Webhook Trigger
\`\`\`bash
POST http://localhost:3000/webhook

{
  "payload": {
    "data": "webhook data"
  }
}
\`\`\`

### Health Check
\`\`\`bash
GET http://localhost:3000/health
\`\`\`

### Workflow Status
\`\`\`bash
GET http://localhost:3000/status
\`\`\`

## Development

### Local Development (without Docker)
\`\`\`bash
npm install
npm run dev
\`\`\`

### View Logs
\`\`\`bash
docker-compose logs -f
\`\`\`

### Stop Service
\`\`\`bash
docker-compose down
\`\`\`

## Files

- \`server.js\` - Express server with API endpoints
- \`${workflowFileName}\` - Workflow definition
- \`prompd.json\` - Package dependencies
- \`Dockerfile\` - Container build instructions
- \`docker-compose.yml\` - Compose configuration
- \`.env\` - Environment variables (create from .env.example)

## Deployment

### Production Deployment

1. Set production environment variables in \`.env\`
2. Build and deploy with Docker Compose
3. Use a reverse proxy (nginx, traefik) for HTTPS
4. Set up monitoring and logging

### Cloud Deployment Options

- **AWS ECS/Fargate**: Deploy container directly
- **Google Cloud Run**: Serverless container deployment
- **Azure Container Instances**: Simple container hosting
- **Kubernetes**: For advanced orchestration needs

## Troubleshooting

### Container fails to start
- Check logs: \`docker-compose logs\`
- Verify API keys in \`.env\`
- Ensure all required files are present

### Workflow execution fails
- Verify API keys are correct
- Check that all package dependencies are installed
- Review server logs for error details

### Health check fails
- Ensure port 3000 is not in use
- Check firewall settings
- Verify container is running: \`docker ps\`

## Support

For issues with Prompd workflows, visit:
- Documentation: https://docs.prompd.ai
- GitHub: https://github.com/prompd
- Registry: https://registry.prompdhub.ai
`
  }

  /**
   * Export a workflow as Kubernetes manifests
   * @param {Object} options
   * @param {Object} options.workflow - The workflow object to export
   * @param {string} options.workflowPath - Path to the workflow file
   * @param {string} options.outputDir - Directory to export to
   * @param {Object} options.prompdjson - Optional prompd.json manifest
   * @param {Object} options.kubernetesOptions - Kubernetes-specific options
   * @returns {Promise<{success: boolean, files: string[], error?: string}>}
   */
  async exportKubernetes(options) {
    const { workflow, workflowPath, outputDir, kubernetesOptions = {} } = options

    const {
      namespace = 'default',
      replicas = 1,
      includeIngress = false,
      ingressDomain = '',
      includeHelm = true,
      imageName = '',
      imageTag = 'latest'
    } = kubernetesOptions

    try {
      // Derive workflow name from metadata (not the workspace package name)
      const workflowName = workflow.metadata?.name || workflow.name || path.basename(workflowPath, '.pdflow')
      options.name = workflowName

      // Detect providers used in workflow
      const { providers, hasOllama } = this.detectProviders(workflow)

      // Create output directory structure
      await fs.mkdir(outputDir, { recursive: true })
      const k8sDir = path.join(outputDir, 'k8s')
      await fs.mkdir(k8sDir, { recursive: true })

      // 1. Use shared packaging utility to create .pdpkg with integrity hashes
      console.log('[WorkflowExport] Creating package with integrity hashes...')
      const packageResult = await packageWorkflow(workflowPath, options, this.getPrompdCli)

      if (!packageResult.success) {
        throw new Error(packageResult.error || 'Failed to create package')
      }

      // 2. Extract package to output directory (contains prompd.json with integrity hashes)
      console.log('[WorkflowExport] Extracting package to:', outputDir)
      safeExtractZip(packageResult.packagePath, outputDir, false)

      const generatedFiles = []
      const workflowRelativePath = packageResult.workflowRelativePath

      // Track extracted files from prompd.json
      const prompdJsonPath = path.join(outputDir, 'prompd.json')
      const prompdJson = JSON.parse(await fs.readFile(prompdJsonPath, 'utf-8'))
      generatedFiles.push(...prompdJson.files)

      // 3. Generate deployment files
      // Dockerfile (needed for building the image)
      const dockerfilePath = path.join(outputDir, 'Dockerfile')
      await fs.writeFile(dockerfilePath, this.generateDockerfile())
      generatedFiles.push('Dockerfile')

      // server.js
      const serverPath = path.join(outputDir, 'server.js')
      await fs.writeFile(serverPath, this.generateServerJs(workflow, workflowRelativePath))
      generatedFiles.push('server.js')

      // package.json
      const packageJsonPath = path.join(outputDir, 'package.json')
      await fs.writeFile(packageJsonPath, this.generatePackageJson(workflow))
      generatedFiles.push('package.json')

      // .prompd/config.yaml (if Ollama detected)
      if (hasOllama) {
        const prompdDir = path.join(outputDir, '.prompd')
        await fs.mkdir(prompdDir, { recursive: true })

        const configPath = path.join(prompdDir, 'config.yaml')
        await fs.writeFile(configPath, this.generatePrompdConfig(hasOllama))
        generatedFiles.push('.prompd/config.yaml')
      }

      // .env.example (only for detected cloud providers)
      const envExamplePath = path.join(outputDir, '.env.example')
      await fs.writeFile(envExamplePath, this.generateEnvExample(providers, hasOllama))
      generatedFiles.push('.env.example')

      // 4. Generate Kubernetes manifests
      const appName = workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

      // Namespace
      const namespacePath = path.join(k8sDir, 'namespace.yaml')
      await fs.writeFile(namespacePath, this.generateNamespace(namespace))
      generatedFiles.push('k8s/namespace.yaml')

      // ConfigMap
      const configMapPath = path.join(k8sDir, 'configmap.yaml')
      await fs.writeFile(configMapPath, this.generateConfigMap(appName, namespace, workflow))
      generatedFiles.push('k8s/configmap.yaml')

      // Secret (template) - only for detected cloud providers
      const secretPath = path.join(k8sDir, 'secret.yaml')
      await fs.writeFile(secretPath, this.generateSecret(appName, namespace, providers, hasOllama))
      generatedFiles.push('k8s/secret.yaml')

      // Deployment
      const deploymentPath = path.join(k8sDir, 'deployment.yaml')
      await fs.writeFile(deploymentPath, this.generateDeployment(appName, namespace, imageName || `${appName}`, imageTag, replicas))
      generatedFiles.push('k8s/deployment.yaml')

      // Service
      const servicePath = path.join(k8sDir, 'service.yaml')
      await fs.writeFile(servicePath, this.generateService(appName, namespace))
      generatedFiles.push('k8s/service.yaml')

      // Ingress (optional)
      if (includeIngress && ingressDomain) {
        const ingressPath = path.join(k8sDir, 'ingress.yaml')
        await fs.writeFile(ingressPath, this.generateIngress(appName, namespace, ingressDomain))
        generatedFiles.push('k8s/ingress.yaml')
      }

      // HorizontalPodAutoscaler
      const hpaPath = path.join(k8sDir, 'hpa.yaml')
      await fs.writeFile(hpaPath, this.generateHPA(appName, namespace, replicas))
      generatedFiles.push('k8s/hpa.yaml')

      // 9. Generate Helm chart (optional)
      if (includeHelm) {
        const helmDir = path.join(outputDir, 'helm')
        await fs.mkdir(helmDir, { recursive: true })

        const templatesDir = path.join(helmDir, 'templates')
        await fs.mkdir(templatesDir, { recursive: true })

        // Chart.yaml
        const chartPath = path.join(helmDir, 'Chart.yaml')
        await fs.writeFile(chartPath, this.generateHelmChart(workflow))
        generatedFiles.push('helm/Chart.yaml')

        // values.yaml
        const valuesPath = path.join(helmDir, 'values.yaml')
        await fs.writeFile(valuesPath, this.generateHelmValues(appName, imageName || `${appName}`, imageTag, replicas, ingressDomain, providers, hasOllama))
        generatedFiles.push('helm/values.yaml')

        // Helm templates (using Go templating)
        const helmDeploymentPath = path.join(templatesDir, 'deployment.yaml')
        await fs.writeFile(helmDeploymentPath, this.generateHelmDeployment())
        generatedFiles.push('helm/templates/deployment.yaml')

        const helmServicePath = path.join(templatesDir, 'service.yaml')
        await fs.writeFile(helmServicePath, this.generateHelmService())
        generatedFiles.push('helm/templates/service.yaml')

        const helmConfigMapPath = path.join(templatesDir, 'configmap.yaml')
        await fs.writeFile(helmConfigMapPath, this.generateHelmConfigMap())
        generatedFiles.push('helm/templates/configmap.yaml')

        const helmSecretPath = path.join(templatesDir, 'secret.yaml')
        await fs.writeFile(helmSecretPath, this.generateHelmSecret())
        generatedFiles.push('helm/templates/secret.yaml')

        if (includeIngress) {
          const helmIngressPath = path.join(templatesDir, 'ingress.yaml')
          await fs.writeFile(helmIngressPath, this.generateHelmIngress())
          generatedFiles.push('helm/templates/ingress.yaml')
        }
      }

      // 10. Generate Kubernetes README
      const readmePath = path.join(outputDir, 'README-k8s.md')
      await fs.writeFile(readmePath, this.generateKubernetesReadme(workflow, appName, namespace, includeHelm, includeIngress, ingressDomain))
      generatedFiles.push('README-k8s.md')

      // 11. Generate kustomization.yaml
      const kustomizationPath = path.join(k8sDir, 'kustomization.yaml')
      await fs.writeFile(kustomizationPath, this.generateKustomization(appName, includeIngress))
      generatedFiles.push('k8s/kustomization.yaml')

      // 12. Clean up temporary package file
      await fs.unlink(packageResult.packagePath).catch(() => {})

      console.log(`[WorkflowExport] Successfully exported Kubernetes manifests to ${outputDir}`)
      console.log(`[WorkflowExport] Generated ${generatedFiles.length} files`)

      return {
        success: true,
        files: generatedFiles,
        outputDir
      }

    } catch (error) {
      console.error('[WorkflowExport] Kubernetes export failed:', error)
      return {
        success: false,
        error: error.message,
        files: []
      }
    }
  }

  /**
   * Generate Kubernetes Namespace manifest
   */
  generateNamespace(namespace) {
    return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app.kubernetes.io/managed-by: prompd
`
  }

  /**
   * Generate Kubernetes Deployment manifest
   */
  generateDeployment(appName, namespace, imageName, imageTag, replicas) {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
        app.kubernetes.io/name: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: ${imageName}:${imageTag}
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        env:
        - name: PORT
          value: "3000"
        - name: NODE_ENV
          value: "production"
        envFrom:
        - configMapRef:
            name: ${appName}-config
        - secretRef:
            name: ${appName}-secrets
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
`
  }

  /**
   * Generate Kubernetes Service manifest
   */
  generateService(appName, namespace) {
    return `apiVersion: v1
kind: Service
metadata:
  name: ${appName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: http
    protocol: TCP
    name: http
  selector:
    app: ${appName}
`
  }

  /**
   * Generate Kubernetes ConfigMap manifest
   */
  generateConfigMap(appName, namespace, workflow) {
    const workflowName = workflow.metadata?.name || 'Unnamed Workflow'
    const workflowVersion = workflow.version || '1.0.0'

    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${appName}-config
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
data:
  WORKFLOW_NAME: "${workflowName}"
  WORKFLOW_VERSION: "${workflowVersion}"
  LOG_LEVEL: "info"
`
  }

  /**
   * Generate Kubernetes Secret manifest (template) - only detected providers
   */
  generateSecret(appName, namespace, providers = new Set(), hasOllama = false) {
    let secretData = ''

    if (providers.size > 0) {
      secretData += '  # Detected cloud providers (base64 encode your API keys)\n'
      secretData += '  # Example: echo -n "your-api-key" | base64\n'

      const providerKeyMap = {
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
        'google': 'GOOGLE_API_KEY',
        'cohere': 'COHERE_API_KEY',
        'replicate': 'REPLICATE_API_KEY',
        'huggingface': 'HUGGINGFACE_API_KEY',
      }

      for (const provider of providers) {
        if (providerKeyMap[provider]) {
          secretData += `  ${providerKeyMap[provider]}: ""\n`
        }
      }
    } else if (!hasOllama) {
      // No providers detected and no Ollama - show generic example
      secretData += '  # No cloud providers detected in workflow\n'
      secretData += '  # Add your API keys here if needed\n'
      secretData += '  # OPENAI_API_KEY: ""\n'
    }

    if (hasOllama) {
      secretData += '\n  # Note: Ollama configuration is in .prompd/config.yaml\n'
      secretData += '  # No API key needed for local Ollama models\n'
    }

    return `apiVersion: v1
kind: Secret
metadata:
  name: ${appName}-secrets
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
type: Opaque
stringData:
${secretData}
`
  }

  /**
   * Generate Kubernetes Ingress manifest
   */
  generateIngress(appName, namespace, ingressDomain) {
    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${appName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - ${ingressDomain}
    secretName: ${appName}-tls
  rules:
  - host: ${ingressDomain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${appName}
            port:
              number: 80
`
  }

  /**
   * Generate HorizontalPodAutoscaler manifest
   */
  generateHPA(appName, namespace, minReplicas) {
    return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${appName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    app.kubernetes.io/name: ${appName}
    app.kubernetes.io/managed-by: prompd
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${appName}
  minReplicas: ${minReplicas}
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
`
  }

  /**
   * Generate kustomization.yaml
   */
  generateKustomization(appName, includeIngress) {
    const resources = [
      'namespace.yaml',
      'configmap.yaml',
      'secret.yaml',
      'deployment.yaml',
      'service.yaml',
      'hpa.yaml'
    ]

    if (includeIngress) {
      resources.push('ingress.yaml')
    }

    return `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
${resources.map(r => `  - ${r}`).join('\n')}

commonLabels:
  app.kubernetes.io/name: ${appName}
  app.kubernetes.io/managed-by: prompd
`
  }

  /**
   * Generate Helm Chart.yaml
   */
  generateHelmChart(workflow) {
    const workflowName = workflow.metadata?.name || 'prompd-workflow'
    const workflowVersion = workflow.version || '1.0.0'
    const description = workflow.metadata?.description || 'Prompd workflow deployment'

    return `apiVersion: v2
name: ${workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
description: ${description}
type: application
version: ${workflowVersion}
appVersion: "${workflowVersion}"
keywords:
  - prompd
  - workflow
  - ai
maintainers:
  - name: Prompd
    url: https://prompd.ai
`
  }

  /**
   * Generate Helm values.yaml
   */
  generateHelmValues(appName, imageName, imageTag, replicas, ingressDomain, providers = new Set(), hasOllama = false) {
    // Generate secrets section for detected providers only
    let secretsSection = ''
    if (providers.size > 0) {
      secretsSection = '# Secrets (provide these during deployment)\nsecrets:\n'

      const providerKeyMap = {
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
        'google': 'GOOGLE_API_KEY',
        'cohere': 'COHERE_API_KEY',
        'replicate': 'REPLICATE_API_KEY',
        'huggingface': 'HUGGINGFACE_API_KEY',
      }

      for (const provider of providers) {
        if (providerKeyMap[provider]) {
          secretsSection += `  ${providerKeyMap[provider]}: ""\n`
        }
      }
    } else if (hasOllama) {
      secretsSection = '# No cloud provider API keys needed\n# This workflow uses Ollama (local models)\n# Configure Ollama connection in .prompd/config.yaml\n'
    } else {
      secretsSection = '# No provider API keys detected\nsecrets: {}\n'
    }

    return `# Default values for ${appName}

replicaCount: ${replicas}

image:
  repository: ${imageName}
  pullPolicy: Always
  tag: "${imageTag}"

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: ${ingressDomain ? 'true' : 'false'}
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: ${ingressDomain || 'workflow.example.com'}
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${appName}-tls
      hosts:
        - ${ingressDomain || 'workflow.example.com'}

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 100m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: ${replicas}
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

# Environment variables
env:
  NODE_ENV: production
  PORT: "3000"
  LOG_LEVEL: info

${secretsSection}`
  }

  /**
   * Generate Helm deployment template
   */
  generateHelmDeployment() {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "chart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "chart.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        env:
        {{- range $key, $value := .Values.env }}
        - name: {{ $key }}
          value: {{ $value | quote }}
        {{- end }}
        envFrom:
        - secretRef:
            name: {{ include "chart.fullname" . }}-secrets
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
`
  }

  /**
   * Generate Helm service template
   */
  generateHelmService() {
    return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
  - port: {{ .Values.service.port }}
    targetPort: http
    protocol: TCP
    name: http
  selector:
    {{- include "chart.selectorLabels" . | nindent 4 }}
`
  }

  /**
   * Generate Helm ConfigMap template
   */
  generateHelmConfigMap() {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "chart.fullname" . }}-config
  labels:
    {{- include "chart.labels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.env }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
`
  }

  /**
   * Generate Helm Secret template
   */
  generateHelmSecret() {
    return `apiVersion: v1
kind: Secret
metadata:
  name: {{ include "chart.fullname" . }}-secrets
  labels:
    {{- include "chart.labels" . | nindent 4 }}
type: Opaque
stringData:
  {{- range $key, $value := .Values.secrets }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
`
  }

  /**
   * Generate Helm Ingress template
   */
  generateHelmIngress() {
    return `{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "chart.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`
  }

  /**
   * Generate Kubernetes deployment README
   */
  generateKubernetesReadme(workflow, appName, namespace, includeHelm, includeIngress, ingressDomain) {
    const workflowName = workflow.metadata?.name || 'Prompd Workflow'
    const workflowVersion = workflow.version || '1.0.0'

    return `# ${workflowName} - Kubernetes Deployment

Version: ${workflowVersion}

## Overview

This package contains Kubernetes manifests for deploying the **${workflowName}** workflow as a containerized service.

## Prerequisites

- Kubernetes cluster (v1.19+)
- kubectl configured
- Docker registry access${includeHelm ? '\n- Helm 3.x (optional, for Helm deployment)' : ''}${includeIngress ? '\n- NGINX Ingress Controller\n- cert-manager (for TLS certificates)' : ''}

## Quick Start

### 1. Build and Push Docker Image

\`\`\`bash
# Build the Docker image
docker build -t ${appName}:${workflowVersion} .

# Tag for your registry
docker tag ${appName}:${workflowVersion} your-registry/${appName}:${workflowVersion}

# Push to registry
docker push your-registry/${appName}:${workflowVersion}
\`\`\`

### 2. Configure Secrets

Edit \`k8s/secret.yaml\` and add your API keys (base64 encoded):

\`\`\`bash
# Encode your API keys
echo -n "your-openai-api-key" | base64

# Edit secret.yaml and paste the encoded values
kubectl edit -f k8s/secret.yaml
\`\`\`

### 3. Update Image Reference

Edit \`k8s/deployment.yaml\` and update the image field:

\`\`\`yaml
spec:
  containers:
  - name: ${appName}
    image: your-registry/${appName}:${workflowVersion}  # Update this line
\`\`\`

### 4. Deploy to Kubernetes

\`\`\`bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy all manifests
kubectl apply -f k8s/

# Or use kustomize
kubectl apply -k k8s/
\`\`\`

## Deployment Methods

### Method 1: kubectl (Basic)

\`\`\`bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml${includeIngress ? '\nkubectl apply -f k8s/ingress.yaml' : ''}
\`\`\`

### Method 2: Kustomize

\`\`\`bash
# Deploy using kustomize
kubectl apply -k k8s/

# Or build first to see output
kubectl kustomize k8s/ | kubectl apply -f -
\`\`\`
${includeHelm ? `
### Method 3: Helm (Recommended)

\`\`\`bash
# Install the chart
helm install ${appName} ./helm \\
  --namespace ${namespace} \\
  --create-namespace \\
  --set image.repository=your-registry/${appName} \\
  --set image.tag=${workflowVersion} \\
  --set secrets.OPENAI_API_KEY=your-api-key

# Upgrade existing deployment
helm upgrade ${appName} ./helm \\
  --namespace ${namespace} \\
  --set image.tag=new-version

# Uninstall
helm uninstall ${appName} --namespace ${namespace}
\`\`\`

#### Helm Values Customization

Create a \`custom-values.yaml\` file:

\`\`\`yaml
replicaCount: 3

image:
  repository: your-registry/${appName}
  tag: "${workflowVersion}"

resources:
  limits:
    cpu: 2000m
    memory: 2Gi

secrets:
  OPENAI_API_KEY: "your-api-key"
  ANTHROPIC_API_KEY: "your-anthropic-key"
\`\`\`

Then deploy:

\`\`\`bash
helm install ${appName} ./helm -f custom-values.yaml
\`\`\`
` : ''}

## Verify Deployment

\`\`\`bash
# Check pod status
kubectl get pods -n ${namespace}

# View logs
kubectl logs -f deployment/${appName} -n ${namespace}

# Check service
kubectl get svc -n ${namespace}
${includeIngress ? `
# Check ingress
kubectl get ingress -n ${namespace}
` : ''}
# Port forward for local testing
kubectl port-forward svc/${appName} 8080:80 -n ${namespace}

# Test the endpoint
curl http://localhost:8080/health
\`\`\`

## Usage

### Execute Workflow

\`\`\`bash
# From inside the cluster
curl -X POST http://${appName}.${namespace}.svc.cluster.local/execute \\
  -H "Content-Type: application/json" \\
  -d '{"parameters": {"input": "your input"}}'
${includeIngress && ingressDomain ? `
# From outside (via Ingress)
curl -X POST https://${ingressDomain}/execute \\
  -H "Content-Type: application/json" \\
  -d '{"parameters": {"input": "your input"}}'
` : ''}
\`\`\`

### Webhook Trigger

\`\`\`bash
curl -X POST http://${appName}.${namespace}.svc.cluster.local/webhook \\
  -H "Content-Type: application/json" \\
  -d '{"event": "trigger", "data": {}}'
\`\`\`

### Health Check

\`\`\`bash
curl http://${appName}.${namespace}.svc.cluster.local/health
\`\`\`

## Configuration

### Environment Variables (ConfigMap)

Edit \`k8s/configmap.yaml\` to customize:

\`\`\`yaml
data:
  WORKFLOW_NAME: "${workflowName}"
  LOG_LEVEL: "info"
\`\`\`

### Secrets

Update \`k8s/secret.yaml\` with your API keys:

\`\`\`bash
# Create secret from literal values
kubectl create secret generic ${appName}-secrets \\
  --from-literal=OPENAI_API_KEY=your-key \\
  --from-literal=ANTHROPIC_API_KEY=your-key \\
  -n ${namespace}
\`\`\`

### Resource Limits

Edit \`k8s/deployment.yaml\` to adjust CPU/memory:

\`\`\`yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
\`\`\`

## Scaling

### Manual Scaling

\`\`\`bash
# Scale to 5 replicas
kubectl scale deployment/${appName} --replicas=5 -n ${namespace}
\`\`\`

### Auto-Scaling (HPA)

The HorizontalPodAutoscaler is configured to scale based on CPU/memory:

\`\`\`bash
# Check HPA status
kubectl get hpa -n ${namespace}

# Adjust HPA settings
kubectl edit hpa/${appName} -n ${namespace}
\`\`\`
${includeIngress && ingressDomain ? `
## Ingress & TLS

### DNS Configuration

Point your domain to the Ingress Controller's LoadBalancer IP:

\`\`\`bash
# Get Ingress IP
kubectl get ingress ${appName} -n ${namespace}

# Add A record: ${ingressDomain} → <INGRESS-IP>
\`\`\`

### TLS Certificates

cert-manager will automatically provision Let's Encrypt certificates.

\`\`\`bash
# Check certificate status
kubectl get certificate -n ${namespace}

# Describe certificate for details
kubectl describe certificate ${appName}-tls -n ${namespace}
\`\`\`
` : ''}

## Monitoring

### View Logs

\`\`\`bash
# Stream logs from all pods
kubectl logs -f -l app=${appName} -n ${namespace}

# Logs from specific pod
kubectl logs <pod-name> -n ${namespace}

# Previous container logs
kubectl logs <pod-name> --previous -n ${namespace}
\`\`\`

### Pod Status

\`\`\`bash
# Get pod details
kubectl describe pod <pod-name> -n ${namespace}

# Execute commands in pod
kubectl exec -it <pod-name> -n ${namespace} -- /bin/sh
\`\`\`

## Troubleshooting

### Pods Not Starting

\`\`\`bash
# Check pod events
kubectl describe pod <pod-name> -n ${namespace}

# Common issues:
# - Image pull errors: Verify registry credentials
# - CrashLoopBackOff: Check logs for application errors
# - Pending: Check resource availability
\`\`\`

### Service Not Accessible

\`\`\`bash
# Verify service endpoints
kubectl get endpoints ${appName} -n ${namespace}

# Test from another pod
kubectl run test-pod --image=curlimages/curl -it --rm -- \\
  curl http://${appName}.${namespace}.svc.cluster.local/health
\`\`\`

### Secret Issues

\`\`\`bash
# Verify secret exists
kubectl get secret ${appName}-secrets -n ${namespace}

# Check secret data
kubectl get secret ${appName}-secrets -n ${namespace} -o yaml
\`\`\`
${includeIngress ? `
### Ingress Issues

\`\`\`bash
# Check ingress status
kubectl describe ingress ${appName} -n ${namespace}

# Verify ingress controller
kubectl get pods -n ingress-nginx

# Check certificate provisioning
kubectl describe certificate ${appName}-tls -n ${namespace}
\`\`\`
` : ''}

## Cleanup

\`\`\`bash
# Delete all resources${includeHelm ? `
# If using Helm:
helm uninstall ${appName} -n ${namespace}

# If using kubectl:` : ''}
kubectl delete -f k8s/

# Or with kustomize:
kubectl delete -k k8s/

# Delete namespace (removes everything)
kubectl delete namespace ${namespace}
\`\`\`

## Production Checklist

- [ ] Update image registry to production registry
- [ ] Configure proper resource limits based on load testing
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log aggregation (ELK/Loki)
- [ ] Enable pod security policies
- [ ] Configure network policies for pod isolation
- [ ] Set up backup strategy for persistent data
- [ ] Configure pod disruption budgets
- [ ] Enable audit logging
- [ ] Review and harden RBAC policies${includeIngress ? '\n- [ ] Configure rate limiting on Ingress\n- [ ] Set up WAF (Web Application Firewall)' : ''}

## Support

- **Prompd Documentation**: https://docs.prompd.ai
- **Kubernetes Docs**: https://kubernetes.io/docs/
- **Helm Docs**: https://helm.sh/docs/

## License

Generated by Prompd - https://prompd.ai
`
  }

  /**
   * Detect LLM providers used in the workflow
   * @param {Object} workflow
   * @returns {Object} - { providers: Set<string>, hasOllama: boolean }
   */
  detectProviders(workflow) {
    const providers = new Set()
    let hasOllama = false

    if (!workflow.nodes) {
      return { providers, hasOllama }
    }

    // Scan all prompt nodes for provider configuration
    for (const node of workflow.nodes) {
      if (node.type === 'prompt' && node.data?.provider) {
        const provider = node.data.provider.toLowerCase()

        if (provider === 'ollama') {
          hasOllama = true
        } else {
          providers.add(provider)
        }
      }
    }

    console.log(`[WorkflowExport] Detected providers:`, Array.from(providers), hasOllama ? '+ Ollama (local)' : '')

    return { providers, hasOllama }
  }

  /**
   * Generate .prompd/config.yaml for local configuration
   * @param {boolean} hasOllama - Whether workflow uses Ollama
   * @returns {string}
   */
  generatePrompdConfig(hasOllama) {
    if (!hasOllama) return null

    return `# Prompd Configuration
# This file is loaded automatically and overrides ~/.prompd/config.yaml

# Ollama Configuration (local models - no API key needed)
custom_providers:
  ollama:
    base_url: http://localhost:11434
    api_type: ollama

# Set Ollama as default if you want
# default_provider: ollama
# default_model: llama2

# For cloud providers, set API keys via environment variables or secrets
`
  }

  /**
   * Extract .prmd file references from workflow
   * @param {Object} workflow
   * @returns {string[]}
   */
}

module.exports = {
  WorkflowExportService
}
