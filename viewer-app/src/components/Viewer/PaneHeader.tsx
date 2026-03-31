export function PaneHeader({ title, subtitle, highlighted, onToggleHighlight }: {
  title: string
  subtitle?: string
  highlighted?: boolean
  onToggleHighlight?: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs shrink-0">
      <span className="font-semibold text-gray-500 uppercase tracking-wide shrink-0">{title}</span>
      {subtitle && (
        <span className="text-gray-400 truncate flex-1" title={subtitle}>{subtitle}</span>
      )}
      {onToggleHighlight && (
        <button
          onClick={onToggleHighlight}
          title={highlighted ? 'ハイライトを非表示' : 'ハイライトを表示'}
          className={[
            'shrink-0 px-1.5 py-0.5 rounded text-xs transition-colors',
            highlighted
              ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          ].join(' ')}
        >
          ★
        </button>
      )}
    </div>
  )
}
