const { ipcRenderer, contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data: any) => ipcRenderer.invoke('save-data', data),
  runCliCommand: (cmd: string) => ipcRenderer.invoke('run-cli-command', cmd),
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (credentials: unknown) => ipcRenderer.invoke('save-credentials', credentials),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
  getMemoryMetrics: () => ipcRenderer.invoke('get-memory-metrics'),
  runPromptCli: (serviceId: string, prompt: string) => ipcRenderer.invoke('run-prompt-cli', { serviceId, prompt }),
})
