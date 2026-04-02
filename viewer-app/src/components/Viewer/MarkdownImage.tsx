import { useEffect, useState } from 'react'
import { resolveAbsPath } from './contentUtils'

interface MarkdownImageProps {
  src?: string
  alt?: string
  title?: string
  docPath: string | null
  onImageClick?: (url: string) => void
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function isDirectUrl(src: string): boolean {
  return /^(https?:|data:|file:|localfile:|\/)/i.test(src)
}

function normalizeRelativeSrc(src: string): string {
  const noQuery = src.split('#')[0].split('?')[0]
  try {
    return decodeURIComponent(noQuery)
  } catch {
    return noQuery
  }
}

export function MarkdownImage({ src, alt, title, docPath, onImageClick }: MarkdownImageProps): JSX.Element {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src ?? '')

  useEffect(() => {
    if (!src) {
      setResolvedSrc('')
      return
    }

    if (isDirectUrl(src) || !docPath) {
      setResolvedSrc(src)
      return
    }

    const normalizedSrc = normalizeRelativeSrc(src)
    const docDir = docPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const absPath = resolveAbsPath(docDir, normalizedSrc).replace(/\//g, '\\')

    window.api.readBinary(absPath).then((res) => {
      if (res.ok && res.data) {
        const ext = absPath.split('.').pop()?.toLowerCase() ?? 'png'
        const mime = MIME[ext] ?? 'image/png'
        setResolvedSrc(`data:${mime};base64,${res.data}`)
      } else {
        setResolvedSrc(src)
      }
    })
  }, [docPath, src])

  return (
    <img
      src={resolvedSrc}
      alt={alt ?? ''}
      title={title}
      style={{
        border: '1px solid #000',
        borderRadius: '2px',
        ...(onImageClick ? { cursor: 'zoom-in' } : {}),
      }}
      onClick={onImageClick ? () => onImageClick(resolvedSrc) : undefined}
    />
  )
}
