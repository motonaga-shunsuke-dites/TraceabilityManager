import { codeToHtml } from 'shiki'
import { extname } from '../../utils/path'

export function isAdocPath(path: string | null): boolean {
  return !!path && path.toLowerCase().endsWith('.adoc')
}

export function resolveAbsPath(docDir: string, rel: string): string {
  const parts = docDir.replace(/\\/g, '/').split('/')
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export async function resolveAdocImages(html: string, docPath: string): Promise<string> {
  const docDir = docPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')

  const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp'
  }

  const srcSet = new Set<string>()
  html.replace(/\ssrc="([^"]+)"/gi, (_, src) => { srcSet.add(src); return _ })

  const dataUrlMap = new Map<string, string>()
  await Promise.all(
    Array.from(srcSet)
      .filter((src) => !/^(https?:|file:|data:)/.test(src))
      .map(async (src) => {
        const absPath = resolveAbsPath(docDir, src).replace(/\//g, '\\')
        const res = await window.api.readBinary(absPath)
        if (res.ok && res.data) {
          const ext = absPath.split('.').pop()?.toLowerCase() ?? 'png'
          const mime = MIME[ext] ?? 'image/png'
          dataUrlMap.set(src, `data:${mime};base64,${res.data}`)
        }
      })
  )

  return html.replace(/(\ssrc=")([^"]+)(")/gi, (_m, pre, src, post) => {
    const dataUrl = dataUrlMap.get(src)
    return dataUrl ? pre + dataUrl + post : _m
  })
}

export interface SectionSplit { before: string; section: string; after: string }

export function splitAtSection(content: string, heading: string, adoc = false): SectionSplit | null {
  const lines = content.split('\n')

  if (adoc && /^\.[^\s.]/.test(heading)) {
    const titleText = heading.slice(1).trim()
    let startIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^\.[^\s.]/.test(lines[i]) && lines[i].slice(1).trim() === titleText) {
        startIdx = i; break
      }
    }
    if (startIdx === -1) return null
    let endIdx = lines.length
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^={1,6}\s/.test(lines[i]) || /^\.[^\s.]/.test(lines[i])) { endIdx = i; break }
    }
    return { before: lines.slice(0, startIdx).join('\n'), section: lines.slice(startIdx, endIdx).join('\n'), after: lines.slice(endIdx).join('\n') }
  }

  const pattern = adoc ? /^(={1,6})\s+(.+)$/ : /^(#{1,6})\s+(.+)$/
  const m = heading.match(pattern)
  if (!m) return null
  const level = m[1].length
  const headingText = m[2].trim()

  const linePattern = adoc ? /^(={1,6})\s+(.*)$/ : /^(#{1,6})\s+(.*)$/
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(linePattern)
    if (lm && lm[1].length === level && lm[2].trim() === headingText) { startIdx = i; break }
  }
  if (startIdx === -1) return null

  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const lm = lines[i].match(linePattern)
    if (lm && lm[1].length <= level) { endIdx = i; break }
  }

  return { before: lines.slice(0, startIdx).join('\n'), section: lines.slice(startIdx, endIdx).join('\n'), after: lines.slice(endIdx).join('\n') }
}

export async function highlight(code: string, filePath: string): Promise<string> {
  const ext = extname(filePath)
  const langMap: Record<string, string> = {
    '.cs': 'csharp', '.xaml': 'xml', '.java': 'java', '.py': 'python',
    '.cpp': 'cpp', '.cc': 'cpp', '.h': 'cpp', '.ts': 'typescript',
    '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx', '.json': 'json',
    '.xml': 'xml', '.html': 'html', '.css': 'css'
  }
  const lang = langMap[ext] ?? 'text'
  try {
    return await codeToHtml(code, { lang, theme: 'one-dark-pro' })
  } catch {
    return `<pre><code>${code}</code></pre>`
  }
}
