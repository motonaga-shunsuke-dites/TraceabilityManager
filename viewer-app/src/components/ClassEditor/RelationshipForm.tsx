import { useState } from 'react'
import type { DiagramClass, DiagramRelationship, RelType } from './types'
import { REL_LABELS, REL_HELP } from './constants'

interface RelationshipFormProps {
  rel: DiagramRelationship
  classes: DiagramClass[]
  onChange: (updated: DiagramRelationship) => void
}

export function RelationshipForm({ rel, classes, onChange }: RelationshipFormProps): JSX.Element {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      {/* 種類 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-600">関連の種類</span>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="ml-1 w-4 h-4 text-[10px] rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none flex items-center justify-center shrink-0"
            title="各関連の説明を表示"
          >?</button>
        </div>
        {showHelp && (
          <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-gray-700 space-y-1.5">
            {(Object.keys(REL_HELP) as RelType[]).map((type) => (
              <div key={type}>
                <span className="font-semibold text-blue-700">{REL_LABELS[type]}</span>
                <br />
                <span className="whitespace-pre-line text-gray-600">{REL_HELP[type]}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {(Object.keys(REL_LABELS) as RelType[]).map((type) => (
            <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`rel-type-${rel.id}`}
                value={type}
                checked={rel.type === type}
                onChange={() => onChange({ ...rel, type })}
              />
              <span>{REL_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 起点クラス */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">起点クラス</label>
        <select
          value={rel.fromId}
          onChange={(e) => onChange({ ...rel, fromId: e.target.value })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.package ? ` (${c.package})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 起点の多重度 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">起点の多重度</label>
        <input
          value={rel.fromLabel}
          onChange={(e) => onChange({ ...rel, fromLabel: e.target.value })}
          placeholder="例: 1, 0..*, 1..*"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* 終点クラス */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">終点クラス</label>
        <select
          value={rel.toId}
          onChange={(e) => onChange({ ...rel, toId: e.target.value })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.package ? ` (${c.package})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 終点の多重度 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">終点の多重度</label>
        <input
          value={rel.toLabel}
          onChange={(e) => onChange({ ...rel, toLabel: e.target.value })}
          placeholder="例: 1, 0..*, 1..*"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* 関連ラベル */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">ラベル（関連名）</label>
        <input
          value={rel.label}
          onChange={(e) => onChange({ ...rel, label: e.target.value })}
          placeholder="例: uses, contains"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>
    </div>
  )
}
