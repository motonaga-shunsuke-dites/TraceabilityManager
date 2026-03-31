/// <reference types="vite/client" />

import type { IpcResult } from './types'

interface ElectronApi {
  readToml: (filePath: string) => Promise<IpcResult<unknown>>
  writeToml: (filePath: string, data: unknown) => Promise<IpcResult>
  readText: (filePath: string) => Promise<IpcResult<string>>
  writeText: (filePath: string, content: string) => Promise<IpcResult>
  createFile: (filePath: string, content: string) => Promise<IpcResult>
  readBinary: (filePath: string) => Promise<IpcResult<string>>
  renameFile: (oldPath: string, newPath: string) => Promise<IpcResult>
  openFile: (options?: { multiple?: boolean; extensions?: string[] }) => Promise<string[] | null>
  listFiles: (dir: string, extensions?: string[]) => Promise<IpcResult<string[]>>
  listDirShallow: (dir: string, extensions?: string[]) => Promise<IpcResult<{ dirs: string[]; files: string[] }>>
  listDirs: (dir: string) => Promise<IpcResult<string[]>>
  selectFolder: () => Promise<string | null>
  openToml: () => Promise<string | null>
  saveToml: () => Promise<string | null>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<boolean>
  plantumlJarExists: () => Promise<boolean>
  renderPlantuml: (code: string) => Promise<IpcResult<string>>
}

declare global {
  interface Window {
    api: ElectronApi
  }
}
