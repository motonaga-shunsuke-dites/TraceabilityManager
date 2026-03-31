import type { MarkdownEditorHandle } from '../Editor/MarkdownEditor'
import { isAdocPath } from './contentUtils'

const btn = 'px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 active:bg-gray-300 text-gray-600 leading-none select-none'

export function MarkdownToolbar({
  editorRef,
  filePath
}: {
  editorRef: { current: MarkdownEditorHandle | null }
  filePath: string | null
}): JSX.Element {
  const adoc = isAdocPath(filePath)

  if (adoc) {
    return (
      <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-200 flex-wrap shrink-0">
        <button onClick={() => editorRef.current?.insertLinePrefix('= ')} title="見出し1" className={btn}>H1</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('== ')} title="見出し2" className={btn}>H2</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('=== ')} title="見出し3" className={btn}>H3</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button onClick={() => editorRef.current?.wrapSelection('*', '*', '太字')} title="太字" className={`${btn} font-bold font-sans`}>B</button>
        <button onClick={() => editorRef.current?.wrapSelection('_', '_', '斜体')} title="斜体" className={`${btn} italic font-sans`}>I</button>
        <button onClick={() => editorRef.current?.wrapSelection('`', '`', 'code')} title="インラインコード" className={`${btn} font-mono`}>`C`</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button onClick={() => editorRef.current?.insertLinePrefix('* ')} title="箇条書き" className={btn}>・</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('. ')} title="番号付きリスト" className={`${btn} font-mono`}>1.</button>
        <button onClick={() => editorRef.current?.insertText('NOTE: ')} title="注記" className={btn}>NOTE</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button onClick={() => editorRef.current?.insertText('[source]\n----\n\n----')} title="コードブロック" className={`${btn} font-mono`}>----</button>
        <button onClick={() => editorRef.current?.insertText('|===\n| 列1 | 列2 | 列3\n\n| データ | データ | データ\n|===')} title="テーブル" className={btn}>表</button>
        <button onClick={() => editorRef.current?.insertText('image::../images/ファイル名.png[代替テキスト]')} title="画像" className={btn}>画像</button>
        <button onClick={() => editorRef.current?.insertText("\n'''\n")} title="水平線" className={btn}>—</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-200 flex-wrap shrink-0">
      <button onClick={() => editorRef.current?.insertLinePrefix('# ')} title="見出し1" className={btn}>H1</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('## ')} title="見出し2" className={btn}>H2</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('### ')} title="見出し3" className={btn}>H3</button>
      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
      <button onClick={() => editorRef.current?.wrapSelection('**', '**', '太字')} title="太字" className={`${btn} font-bold font-sans`}>B</button>
      <button onClick={() => editorRef.current?.wrapSelection('*', '*', '斜体')} title="斜体" className={`${btn} italic font-sans`}>I</button>
      <button onClick={() => editorRef.current?.wrapSelection('`', '`', 'code')} title="インラインコード" className={`${btn} font-mono`}>`C`</button>
      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
      <button onClick={() => editorRef.current?.insertLinePrefix('- ')} title="箇条書き" className={btn}>・</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('1. ')} title="番号付きリスト" className={`${btn} font-mono`}>1.</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('> ')} title="引用" className={btn}>&gt;</button>
      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
      <button onClick={() => editorRef.current?.insertText('```\n\n```')} title="コードブロック" className={`${btn} font-mono`}>```</button>
      <button onClick={() => editorRef.current?.insertText('| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| データ | データ | データ |\n')} title="テーブル" className={btn}>表</button>
      <button onClick={() => editorRef.current?.insertText('![代替テキスト](images/ファイル名.png)')} title="画像" className={btn}>画像</button>
      <button onClick={() => editorRef.current?.insertText('\n---\n')} title="水平線" className={btn}>—</button>
    </div>
  )
}
