/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_API_BASE_URL?: string        // Editor backend (port 3001)
  readonly VITE_REGISTRY_URL?: string        // Registry backend (port 4000)
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Extend FileSystemDirectoryHandle with permission methods (non-standard APIs)
interface FileSystemDirectoryHandle {
  queryPermission?(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>
}

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite'
}