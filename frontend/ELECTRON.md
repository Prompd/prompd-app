# Prompd - Electron Desktop Application

Prompd is available as both a **web application** and a **desktop application** powered by Electron.

## 🌐 Web vs 🖥️ Desktop

### Web Application
- **URL**: https://editor.prompdhub.ai
- **Access**: Any modern browser
- **Storage**: Browser localStorage and IndexedDB
- **File Access**: File System Access API (Chrome, Edge)

### Desktop Application
- **Platforms**: Windows, macOS, Linux
- **Native Features**:
  - Native file dialogs
  - Full file system access
  - Offline mode
  - System tray integration
  - Auto-updates
  - Better performance

## 🚀 Quick Start

### Development Mode (Web + Electron)

```bash
# Run web version only
npm run dev

# Run Electron desktop app (development)
npm run electron:dev
```

The Electron dev mode will:
1. Start Vite dev server on port 5173
2. Wait for the server to be ready
3. Launch Electron window pointing to localhost:5173
4. Enable hot-reload for instant updates

### Building for Production

```bash
# Build web version
npm run build

# Build Electron app for all platforms
npm run electron:build

# Build for specific platform
npm run electron:build:win    # Windows (NSIS installer + portable)
npm run electron:build:mac    # macOS (DMG + ZIP)
npm run electron:build:linux  # Linux (AppImage + DEB)
```

**Output**: Installers will be in `dist-electron/` directory

## 📦 Distribution

### Windows
- **NSIS Installer**: `Prompd Setup.exe` (installer with shortcuts)
- **Portable**: `Prompd.exe` (standalone executable)

### macOS
- **DMG**: `Prompd.dmg` (disk image)
- **ZIP**: `Prompd.zip` (portable archive)

### Linux
- **AppImage**: `Prompd.AppImage` (universal, no install needed)
- **DEB**: `prompd.deb` (Debian/Ubuntu package)

## 🔧 Architecture

### Main Process (`electron/main.js`)
- Creates browser window
- Handles native dialogs (open, save, folder selection)
- Provides IPC handlers for file system operations
- Manages app lifecycle

### Preload Script (`electron/preload.js`)
- **Context Isolation**: Secure bridge between main and renderer
- **Exposed API**: `window.electronAPI`
- No direct Node.js access in renderer for security

### Renderer Process
- Same React/Vite application as web version
- Detects Electron environment via `window.electronAPI`
- Falls back to File System Access API in browser

## 🛡️ Security

- **Context Isolation**: ✅ Enabled
- **Node Integration**: ❌ Disabled
- **Sandbox**: ✅ Enabled
- **Content Security Policy**: Inherited from web app
- **IPC Communication**: Whitelisted handlers only

## 🔌 Electron API Usage

The Electron API is exposed via `window.electronAPI` and can be used in your React components:

```typescript
// Check if running in Electron
if (window.electronAPI?.isElectron) {
  // Open file dialog
  const filePath = await window.electronAPI.openFile()

  // Read file
  const result = await window.electronAPI.readFile(filePath)
  if (result.success) {
    console.log(result.content)
  }

  // Write file
  await window.electronAPI.writeFile(filePath, content)

  // Save as dialog
  const savePath = await window.electronAPI.saveFile('untitled.prmd')

  // Open folder
  const folderPath = await window.electronAPI.openFolder()

  // Read directory
  const dirResult = await window.electronAPI.readDir(folderPath)
  if (dirResult.success) {
    dirResult.files.forEach(file => {
      console.log(file.name, file.isDirectory)
    })
  }
}
```

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run web app (Vite dev server) |
| `npm run build` | Build web app for production |
| `npm run preview` | Preview production web build |
| `npm run electron:dev` | Run Electron app in development mode |
| `npm run electron:build` | Build Electron app for current platform |
| `npm run electron:build:win` | Build for Windows |
| `npm run electron:build:mac` | Build for macOS |
| `npm run electron:build:linux` | Build for Linux |

## 🎨 Icons

Application icons are required for proper branding:

- **Windows**: `public/icon.ico` (256x256 or multiple sizes)
- **macOS**: `public/icon.icns` (512x512@2x recommended)
- **Linux**: `public/icon.png` (512x512 PNG)

**Note**: Currently using placeholder icons. Replace with your branding.

## 🔄 Auto-Updates (Future)

The Electron app is configured for auto-updates via `electron-builder`. To enable:

1. Set up a release server (GitHub Releases, S3, etc.)
2. Configure `publish` in `package.json`:
```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "prompd",
    "repo": "prompd-app"
  }
}
```
3. Implement update checking in `main.js` using `electron-updater`

## 🐛 Troubleshooting

### Electron window shows blank screen
- Check if Vite dev server is running on port 5173
- Check `dist/index.html` exists after build
- Open DevTools (Ctrl+Shift+I) to see console errors

### Build fails on macOS
- Ensure you have Xcode Command Line Tools installed
- May need to run `sudo xcode-select --reset`

### Build fails on Windows
- Ensure you have Windows Build Tools installed
- May need Visual Studio C++ Build Tools

### "Module not found" errors
- Run `npm install` to ensure all dependencies are installed
- Delete `node_modules` and reinstall if issues persist

## 📝 Development Notes

### Both Web and Electron
The same codebase runs in both environments. Feature detection:

```typescript
const isElectron = !!window.electronAPI?.isElectron
const platform = window.electronAPI?.platform || 'web'

if (isElectron) {
  // Use native Electron file APIs
  const file = await window.electronAPI.openFile()
} else {
  // Use browser File System Access API
  const [fileHandle] = await window.showOpenFilePicker()
}
```

### State Management
- **Web**: localStorage + IndexedDB
- **Electron**: Same as web, but can also use native file system
- Both modes work seamlessly

## 🚢 Deployment

### Web Deployment
1. Build: `npm run build`
2. Deploy `dist/` folder to CDN/hosting
3. Configure environment variables via `.env.local`

### Electron Distribution
1. Build for target platform(s)
2. Upload installers to GitHub Releases or hosting
3. Optionally set up auto-update server
4. Distribute download links

## 📚 Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-builder](https://www.electron.build/)
- [Vite + Electron Guide](https://vitejs.dev/guide/backend-integration)
- [Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
