import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { history, historyKeymap } from '@codemirror/commands'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'

export interface MarkdownEditorHandle {
  /** カーソル位置（または選択範囲）にテキストを挿入する */
  insertText: (text: string) => void
  /** 選択テキストを before/after で囲む。選択なしは placeholder を挿入して囲む */
  wrapSelection: (before: string, after: string, placeholder: string) => void
  /** 現在行の先頭にプレフィックスを挿入する */
  insertLinePrefix: (prefix: string) => void
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, monospace' },
  '.cm-content': { padding: '8px 0' }
})

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ value, onChange, readOnly = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useImperativeHandle(ref, () => ({
      insertText(text: string) {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length }
        })
        view.focus()
      },
      wrapSelection(before: string, after: string, placeholder: string) {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const selected = view.state.sliceDoc(from, to)
        const inner = selected || placeholder
        const insert = `${before}${inner}${after}`
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + before.length, head: from + before.length + inner.length }
        })
        view.focus()
      },
      insertLinePrefix(prefix: string) {
        const view = viewRef.current
        if (!view) return
        const { from } = view.state.selection.main
        const line = view.state.doc.lineAt(from)
        view.dispatch({
          changes: { from: line.from, to: line.from, insert: prefix },
          selection: { anchor: from + prefix.length }
        })
        view.focus()
      }
    }))

    // エディタ初期化
    useEffect(() => {
      if (!containerRef.current) return

      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            markdown(),
            oneDark,
            baseTheme,
            EditorView.editable.of(!readOnly),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString())
              }
            })
          ]
        }),
        parent: containerRef.current
      })

      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly])

    // 外部から value が変わったとき（ノード切り替え）にエディタ内容を同期
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current !== value) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value }
        })
      }
    }, [value])

    return (
      <div
        ref={containerRef}
        className="h-full overflow-hidden border border-gray-200 rounded"
      />
    )
  }
)
