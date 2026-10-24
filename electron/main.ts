import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Unified Supervisor',
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: true,
    center: true,
    alwaysOnTop: true, // Force to front of desktop
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false)
    }
  }, 3000)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.restore()
      mainWindow.focus()
      mainWindow.moveTop()
    }
  })

  mainWindow.show()
  mainWindow.restore()
  mainWindow.focus()
  mainWindow.moveTop()

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Capture all frontend console logs and print them to the backend terminal
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Browser Console] ${message}`)
  })
}

// Observe webview guest contents and log issues
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.on('console-message', (_e, _level, message) => {
      console.log(`[Webview Console] ${message}`)
    })
    contents.on('render-process-gone', (_e, details) => {
      console.warn(`[Webview Process Gone] Reason: ${details.reason}`)
    })
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Basic state management
const dataPath = path.join(app.getPath('userData'), 'unified-supervisor-data.json')

ipcMain.handle('get-data', () => {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'))
    }
    return {}
  } catch (_error) {
    return {}
  }
})

ipcMain.handle('save-data', (_, data) => {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
    return true
  } catch (_error) {
    return false
  }
})

// Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  }
})
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

const execAsync = promisify(exec)

function getAgyInvocation() {
  const configuredPath = process.env['AGY_EXECUTABLE']?.trim().replace(/^"|"$/g, '')
  const candidates = [
    configuredPath,
    path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate))

  return executablePath
    ? `& "${executablePath.replace(/"/g, '`"')}"`
    : 'agy'
}

const ALLOWED_COMMANDS = [
  'echo /status | codex',
  'echo /usage | agy'
]

ipcMain.handle('run-cli-command', async (_, command: string) => {
  try {
    const isAllowed = 
      ALLOWED_COMMANDS.includes(command) ||
      command.startsWith('echo ') ||
      command.startsWith('agy ') ||
      command.startsWith('codex ')
    if (!isAllowed) {
      throw new Error(`Security Exception: Command "${command}" is not in the allowed whitelist.`)
    }
    let execCmd = command
    if (command.includes('agy')) {
      execCmd = command.replace(/\bagy\b/, getAgyInvocation())
    }
    const { stdout, stderr } = await execAsync(execCmd, { shell: 'powershell.exe', timeout: 12000 })
    return { success: true, stdout, stderr }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('run-prompt-cli', async (_, { serviceId, prompt }: { serviceId: string; prompt: string }) => {
  try {
    if (serviceId === 'gemini-cli') {
      const sanitized = prompt.replace(/"/g, '`"').replace(/\$/g, '`$')
      const bin = getAgyInvocation()
      const cmd = `${bin} --print "${sanitized}"`
      const { stdout, stderr } = await execAsync(cmd, { shell: 'powershell.exe', timeout: 25000 })
      return { success: true, text: stdout?.trim() || stderr?.trim() || 'CLI executed without output.' }
    } else if (serviceId === 'gpt-cli') {
      const sanitized = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$')
      const cmd = `codex exec --skip-git-repo-check --ephemeral "${sanitized}"`
      const { stdout, stderr } = await execAsync(cmd, { shell: 'powershell.exe', timeout: 25000 })
      return { success: true, text: stdout?.trim() || stderr?.trim() || 'Codex executed without output.' }
    } else {
      return { success: false, error: `${serviceId} does not support prompt CLI execution.` }
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'CLI prompt execution failed.' }
  }
})

ipcMain.handle('get-memory-metrics', async () => {
  try {
    const metrics = app.getAppMetrics()
    const totalWorkingSetKB = metrics.reduce((acc, m) => acc + (m.memory?.workingSetSize || 0), 0)
    const totalMB = Math.round(totalWorkingSetKB / 1024)
    return {
      totalMB,
      processCount: metrics.length,
      details: metrics.map(m => ({
        type: m.type,
        memoryMB: Math.round((m.memory?.workingSetSize || 0) / 1024)
      }))
    }
  } catch (_e) {
    return { totalMB: 0, processCount: 0, details: [] }
  }
})

type WebCredentialId = 'chatgpt-web' | 'gemini-web' | 'claude-web'
type WebCredentials = Record<WebCredentialId, { email: string; password: string }>

const emptyCredentials: WebCredentials = {
  'chatgpt-web': { email: '', password: '' },
  'gemini-web': { email: '', password: '' },
  'claude-web': { email: '', password: '' },
}
const credentialPath = path.join(app.getPath('userData'), 'credentials.enc')
const legacyCredentialPath = path.join(__dirname, '../credentials.json')

function hasSecureCredentialStorage() {
  if (!safeStorage.isEncryptionAvailable()) return false
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

function normalizeCredentials(value: unknown): WebCredentials {
  const input = value && typeof value === 'object'
    ? value as Partial<WebCredentials>
    : {}
  const result = { ...emptyCredentials }

  for (const id of Object.keys(result) as WebCredentialId[]) {
    const entry = input[id]
    result[id] = {
      email: typeof entry?.email === 'string' ? entry.email : '',
      password: typeof entry?.password === 'string' ? entry.password : '',
    }
  }

  return result
}

function writeEncryptedCredentials(value: unknown) {
  if (!hasSecureCredentialStorage()) {
    throw new Error('Secure OS credential storage is unavailable; credentials were not saved.')
  }

  fs.mkdirSync(path.dirname(credentialPath), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(normalizeCredentials(value)))
  const temporaryPath = `${credentialPath}.tmp`
  fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 })
  fs.renameSync(temporaryPath, credentialPath)
}

function readCredentials(): WebCredentials {
  if (fs.existsSync(credentialPath)) {
    if (!hasSecureCredentialStorage()) {
      throw new Error('Secure OS credential storage is unavailable; saved credentials were not opened.')
    }
    const encrypted = fs.readFileSync(credentialPath)
    const credentials = normalizeCredentials(JSON.parse(safeStorage.decryptString(encrypted)))
    if (fs.existsSync(legacyCredentialPath)) {
      fs.rmSync(legacyCredentialPath, { force: true })
    }
    return credentials
  }

  if (fs.existsSync(legacyCredentialPath)) {
    const legacyCredentials = normalizeCredentials(
      JSON.parse(fs.readFileSync(legacyCredentialPath, 'utf8'))
    )
    writeEncryptedCredentials(legacyCredentials)
    fs.rmSync(legacyCredentialPath, { force: true })
    return legacyCredentials
  }

  return { ...emptyCredentials }
}

ipcMain.handle('get-credentials', () => {
  return readCredentials()
})

ipcMain.handle('save-credentials', (_, credentials: unknown) => {
  writeEncryptedCredentials(credentials)
  if (fs.existsSync(legacyCredentialPath)) {
    fs.rmSync(legacyCredentialPath, { force: true })
  }
  return true
})

ipcMain.handle('get-preload-path', () => {
  const preloadPath = path.join(__dirname, 'webview-preload.cjs')
  return pathToFileURL(preloadPath).href
})
