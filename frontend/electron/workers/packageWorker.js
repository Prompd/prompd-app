/**
 * Package Build Worker
 *
 * Runs createPackageFromPrompdJson in a separate thread to avoid blocking the UI.
 * Uses workerThreads to offload CPU-intensive file operations.
 */

const { parentPort, workerData } = require('worker_threads')

async function buildPackage() {
  const { workspacePath, outputDir } = workerData

  try {
    // Dynamic import of ESM module
    const { createPackageFromPrompdJson } = await import('@prompd/cli')

    const result = await createPackageFromPrompdJson(workspacePath, outputDir)

    parentPort.postMessage({ success: true, result })
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message || 'Package creation failed'
    })
  }
}

buildPackage()
