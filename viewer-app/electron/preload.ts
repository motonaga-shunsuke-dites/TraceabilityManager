import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Renderer から呼び出せる API を定義（セキュリティ境界）
const api = {
  // TOML ファイル操作
  readToml: (filePath: string) => ipcRenderer.invoke('file:readToml', filePath),
  writeToml: (filePath: string, data: unknown) =>
    ipcRenderer.invoke('file:writeToml', filePath, data),

  // テキストファイル操作
  readText: (filePath: string) => ipcRenderer.invoke('file:readText', filePath),
  writeText: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:writeText', filePath, content),
  createFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:createFile', filePath, content),
  readBinary: (filePath: string) => ipcRenderer.invoke('file:readBinary', filePath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:renameFile', oldPath, newPath),

  // ダイアログ
  openFile: (options?: { multiple?: boolean; extensions?: string[] }) =>
    ipcRenderer.invoke('file:openFile', options),
  selectFolder: () => ipcRenderer.invoke('file:selectFolder'),
  openToml: () => ipcRenderer.invoke('file:openToml'),
  saveToml: () => ipcRenderer.invoke('file:saveToml'),

  // ファイル一覧取得
  listFiles: (dir: string, extensions?: string[]) =>
    ipcRenderer.invoke('file:listFiles', dir, extensions),
  listDirShallow: (dir: string, extensions?: string[]) =>
    ipcRenderer.invoke('file:listDirShallow', dir, extensions),
  listDirs: (dir: string) => ipcRenderer.invoke('file:listDirs', dir),

  // 永続ストレージ
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

  // PlantUML
  plantumlJarExists: () => ipcRenderer.invoke('plantuml:jarExists'),
  renderPlantuml: (code: string) => ipcRenderer.invoke('plantuml:render', code),
  openPlantumlPreviewWindow: (svg: string, title?: string) =>
    ipcRenderer.invoke('plantuml:openPreviewWindow', svg, title)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (only for development)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
