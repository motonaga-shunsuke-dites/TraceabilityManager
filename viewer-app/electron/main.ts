import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join, dirname, extname as nodeExtname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync } from 'fs'
import { spawnSync } from 'child_process'
import Store from 'electron-store'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

let plantumlPreviewWindow: BrowserWindow | null = null

/** plantuml.jar のパスを解決する（複数候補を試行） */
function getJarPath(): string {
  const base = app.getAppPath()
  const candidates = [
    join(base, '..', 'tools', 'plantuml', 'plantuml.jar'),
    join(base, 'tools', 'plantuml', 'plantuml.jar'),
    join(process.resourcesPath || '', 'plantuml', 'plantuml.jar'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

/** plantuml.jar が見つからない場合のエラーメッセージを生成する */
function getJarNotFoundMessage(): string {
  const base = app.getAppPath()
  const candidates = [
    join(base, '..', 'tools', 'plantuml', 'plantuml.jar'),
    join(base, 'tools', 'plantuml', 'plantuml.jar'),
    join(process.resourcesPath || '', 'plantuml', 'plantuml.jar'),
  ]
  const candidateList = candidates.map(c => `  • ${c}`).join('\n')
  return `plantuml.jar が見つかりません。以下のいずれかの場所に plantuml.jar を配置してください：\n${candidateList}\n\n推奨: resources/plantuml/plantuml.jar へ配置してください。`
}

const store = new Store()

function createWindow(): void {
  const savedBounds = store.get('windowBounds') as Electron.Rectangle | undefined

  const mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds())
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ローカルファイルをレンダラーへ安全に提供するカスタムプロトコル
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, supportFetchAPI: true, corsEnabled: false } }
])

app.whenReady().then(() => {
  // localfile:///C:/path/to/file → ローカルファイルを返す
  protocol.handle('localfile', (request) => {
    const url = request.url.replace(/^localfile:\/\/\//, '')
    return net.fetch('file:///' + url)
  })

  electronApp.setAppUserModelId('com.viewer.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- IPC ハンドラー ---

  // TOML 読み込み
  ipcMain.handle('file:readToml', async (_, filePath: string) => {
    try {
      const content = readFileSync(filePath, 'utf-8')
      return { ok: true, data: parseToml(content) }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // TOML 書き込み
  ipcMain.handle('file:writeToml', async (_, filePath: string, data: unknown) => {
    try {
      writeFileSync(filePath, stringifyToml(data as Record<string, unknown>), 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // テキストファイル読み込み
  ipcMain.handle('file:readText', async (_, filePath: string) => {
    try {
      const content = readFileSync(filePath, 'utf-8')
      return { ok: true, data: content }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // バイナリファイル読み込み（Base64 で返す）
  ipcMain.handle('file:readBinary', async (_, filePath: string) => {
    try {
      const buf = readFileSync(filePath)
      return { ok: true, data: buf.toString('base64') }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // テキストファイル書き込み
  ipcMain.handle('file:writeText', async (_, filePath: string, content: string) => {
    try {
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ディレクトリ一覧取得（再帰・フォルダのみ）
  ipcMain.handle('file:listDirs', async (_, dir: string) => {
    try {
      const results: string[] = []
      const walk = (d: string): void => {
        let entries: ReturnType<typeof readdirSync>
        try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          if (e.isDirectory()) {
            const fullPath = join(d, e.name)
            results.push(fullPath)
            walk(fullPath)
          }
        }
      }
      walk(dir)
      return { ok: true, data: results }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // 新規ファイル作成（中間ディレクトリも自動生成）
  ipcMain.handle('file:createFile', async (_, filePath: string, content: string = '') => {
    try {
      if (existsSync(filePath)) {
        return { ok: false, error: 'ファイルが既に存在します' }
      }
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ファイル選択ダイアログ（拡張子フィルター付き・複数選択可）
  ipcMain.handle('file:openFile', async (_, options?: { multiple?: boolean; extensions?: string[] }) => {
    const filters = options?.extensions?.length
      ? [
          { name: 'ソースファイル', extensions: options.extensions },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      : [{ name: 'すべてのファイル', extensions: ['*'] }]
    const result = await dialog.showOpenDialog({
      filters,
      properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile']
    })
    return result.canceled ? null : result.filePaths
  })

  // フォルダ選択ダイアログ
  ipcMain.handle('file:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // TOML ファイルを開くダイアログ
  ipcMain.handle('file:openToml', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'TOML ファイル', extensions: ['toml'] },
        { name: 'すべてのファイル', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // TOML ファイルの保存先選択ダイアログ
  ipcMain.handle('file:saveToml', async () => {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: 'TOML ファイル', extensions: ['toml'] },
        { name: 'すべてのファイル', extensions: ['*'] }
      ],
      defaultPath: 'viewer.toml'
    })
    return result.canceled ? null : result.filePath
  })

  // ディレクトリの1階層だけ読む（dirs: サブディレクトリ, files: 条件に合うファイル）
  ipcMain.handle('file:listDirShallow', async (_, dir: string, extensions?: string[]) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      const dirs: string[] = []
      const files: string[] = []
      for (const e of entries) {
        const fullPath = join(dir, e.name)
        if (e.isDirectory()) {
          dirs.push(fullPath)
        } else {
          const ext = nodeExtname(e.name).slice(1).toLowerCase()
          if (!extensions?.length || extensions.includes(ext)) {
            files.push(fullPath)
          }
        }
      }
      return { ok: true, data: { dirs, files } }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ディレクトリ内ファイル一覧（再帰）
  ipcMain.handle('file:listFiles', async (_, dir: string, extensions?: string[]) => {
    try {
      const results: string[] = []
      const walk = (d: string): void => {
        let entries: ReturnType<typeof readdirSync>
        try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          const fullPath = join(d, e.name)
          if (e.isDirectory()) {
            walk(fullPath)
          } else {
            const ext = nodeExtname(e.name).slice(1).toLowerCase()
            if (!extensions?.length || extensions.includes(ext)) {
              results.push(fullPath)
            }
          }
        }
      }
      walk(dir)
      return { ok: true, data: results }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ファイル名変更
  ipcMain.handle('file:renameFile', async (_, oldPath: string, newPath: string) => {
    try {
      renameSync(oldPath, newPath)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // PlantUML jar の存在確認
  ipcMain.handle('plantuml:jarExists', async () => {
    return existsSync(getJarPath())
  })

  // PlantUML コードを SVG にレンダリング（jar を使用）
  ipcMain.handle('plantuml:render', async (_, code: string) => {
    const jarPath = getJarPath()
    if (!existsSync(jarPath)) {
      return { ok: false, error: getJarNotFoundMessage() }
    }
    try {
      const result = spawnSync(
        'java',
        ['-jar', jarPath, '-tsvg', '-charset', 'UTF-8', '-pipe'],
        { input: Buffer.from(code, 'utf-8'), encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 30000 }
      )
      if (result.error) return { ok: false, error: String(result.error) }
      if (result.status !== 0) {
        return { ok: false, error: result.stderr?.toString('utf-8') || 'PlantUML エラー' }
      }
      return { ok: true, data: result.stdout.toString('utf-8') }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // PlantUML コードを SVG ファイルとして出力
  ipcMain.handle('plantuml:exportSvg', async (_, code: string, outputPath: string) => {
    const jarPath = getJarPath()
    if (!existsSync(jarPath)) {
      return { ok: false, error: getJarNotFoundMessage() }
    }
    try {
      const result = spawnSync(
        'java',
        ['-jar', jarPath, '-tsvg', '-charset', 'UTF-8', '-pipe'],
        { input: Buffer.from(code, 'utf-8'), encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 30000 }
      )
      if (result.error) return { ok: false, error: String(result.error) }
      if (result.status !== 0) {
        return { ok: false, error: result.stderr?.toString('utf-8') || 'PlantUML エラー' }
      }
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, result.stdout.toString('utf-8'), 'utf-8')
      return { ok: true, data: outputPath }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // PlantUML の拡大表示を別ウィンドウで開く（常に単一ウィンドウを再利用）
  ipcMain.handle('plantuml:openPreviewWindow', async (_, svg: string, title?: string) => {
    try {
      if (!plantumlPreviewWindow || plantumlPreviewWindow.isDestroyed()) {
        plantumlPreviewWindow = new BrowserWindow({
          width: 1200,
          height: 900,
          minWidth: 640,
          minHeight: 480,
          autoHideMenuBar: true,
          title: title ?? 'PlantUML プレビュー',
          webPreferences: {
            sandbox: true
          }
        })
        plantumlPreviewWindow.on('closed', () => {
          plantumlPreviewWindow = null
        })
      } else if (!plantumlPreviewWindow.isVisible()) {
        plantumlPreviewWindow.show()
      }

      const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title ?? 'PlantUML プレビュー'}</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #f6f7f9; font-family: "Segoe UI", sans-serif; }
    .frame { height: 100%; display: flex; flex-direction: column; }
    .bar { height: 40px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #4b5563; background: #fff; }
    .canvas { flex: 1; overflow: auto; padding: 16px; }
    .svgWrap { display: inline-block; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="bar">PlantUML プレビュー（別ウィンドウ）</div>
    <div class="canvas"><div class="svgWrap">${svg}</div></div>
  </div>
</body>
</html>`

      plantumlPreviewWindow.setTitle(title ?? 'PlantUML プレビュー')
      // data URL はサイズが大きいSVGで失敗しやすいため、about:blank へ読み込んでから注入する
      await plantumlPreviewWindow.loadURL('about:blank')
      await plantumlPreviewWindow.webContents.executeJavaScript(
        `document.open(); document.write(${JSON.stringify(html)}); document.close();`,
        true
      )
      plantumlPreviewWindow.focus()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // electron-store 読み込み
  ipcMain.handle('store:get', async (_, key: string) => {
    return store.get(key)
  })

  // electron-store 書き込み
  ipcMain.handle('store:set', async (_, key: string, value: unknown) => {
    store.set(key, value)
    return true
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
