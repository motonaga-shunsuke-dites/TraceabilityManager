import { useCallback } from 'react'
import type { DiagramClass, ClassAttribute, ClassMethod, Visibility } from './types'
import { genId } from './utils'
import { VIS_LABELS, ANNOTATION_LABELS } from './constants'
import type { ClassAnnotation } from './types'

interface ClassFormProps {
  cls: DiagramClass
  packages: string[]
  onChange: (updated: DiagramClass) => void
}

export function ClassForm({ cls, packages, onChange }: ClassFormProps): JSX.Element {
  const updateAttr = useCallback(
    (attrId: string, patch: Partial<ClassAttribute>) => {
      onChange({
        ...cls,
        attributes: cls.attributes.map((a) => (a.id === attrId ? { ...a, ...patch } : a)),
      })
    },
    [cls, onChange]
  )

  const updateMethod = useCallback(
    (methodId: string, patch: Partial<ClassMethod>) => {
      onChange({
        ...cls,
        methods: cls.methods.map((m) => (m.id === methodId ? { ...m, ...patch } : m)),
      })
    },
    [cls, onChange]
  )

  const addAttr = useCallback(() => {
    onChange({
      ...cls,
      attributes: [
        ...cls.attributes,
        { id: genId(), visibility: '+', name: 'attribute', type: 'String', isStatic: false },
      ],
    })
  }, [cls, onChange])

  const removeAttr = useCallback(
    (attrId: string) => {
      onChange({ ...cls, attributes: cls.attributes.filter((a) => a.id !== attrId) })
    },
    [cls, onChange]
  )

  const addMethod = useCallback(() => {
    onChange({
      ...cls,
      methods: [
        ...cls.methods,
        { id: genId(), visibility: '+', name: 'method', params: '', returnType: 'void', isAbstract: false, isStatic: false },
      ],
    })
  }, [cls, onChange])

  const removeMethod = useCallback(
    (methodId: string) => {
      onChange({ ...cls, methods: cls.methods.filter((m) => m.id !== methodId) })
    },
    [cls, onChange]
  )

  const listId = `pkg-list-${cls.id}`

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      {/* クラス名 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">クラス名</label>
        <input
          value={cls.name}
          onChange={(e) => onChange({ ...cls, name: e.target.value })}
          placeholder="例: UserAccount"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* 深さ */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">深さ（矢印の長さ・向きに使用）</label>
        <input
          type="number"
          min={0}
          value={cls.depth ?? 0}
          onChange={(e) => onChange({ ...cls, depth: Math.max(0, parseInt(e.target.value) || 0) })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 w-24"
        />
      </div>

      {/* パッケージ */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">パッケージ / 名前空間</label>
        <input
          list={listId}
          value={cls.package}
          onChange={(e) => onChange({ ...cls, package: e.target.value })}
          placeholder="例: com.example.domain（空欄でなし）"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
        <datalist id={listId}>
          {packages.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {/* 種別 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">種別</label>
        <select
          value={cls.annotation}
          onChange={(e) => onChange({ ...cls, annotation: e.target.value as ClassAnnotation })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {(Object.keys(ANNOTATION_LABELS) as ClassAnnotation[]).map((key) => (
            <option key={key} value={key}>
              {ANNOTATION_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* 属性 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">属性（フィールド）</span>
          <button
            onClick={addAttr}
            className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
          >
            + 追加
          </button>
        </div>
        {cls.attributes.length === 0 && (
          <p className="text-xs text-gray-400">属性がありません</p>
        )}
        {cls.attributes.map((attr) => (
          <div key={attr.id} className="flex items-center gap-1 flex-wrap">
            <select
              value={attr.visibility}
              onChange={(e) => updateAttr(attr.id, { visibility: e.target.value as Visibility })}
              title="可視性"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none w-24"
            >
              {(Object.keys(VIS_LABELS) as Visibility[]).map((v) => (
                <option key={v} value={v}>{VIS_LABELS[v]}</option>
              ))}
            </select>
            <input
              value={attr.type}
              onChange={(e) => updateAttr(attr.id, { type: e.target.value })}
              placeholder="型（例: String）"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-20 min-w-0"
            />
            <input
              value={attr.name}
              onChange={(e) => updateAttr(attr.id, { name: e.target.value })}
              placeholder="名前"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
            />
            <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={attr.isStatic}
                onChange={(e) => updateAttr(attr.id, { isStatic: e.target.checked })}
              />
              static
            </label>
            <button
              onClick={() => removeAttr(attr.id)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
              title="削除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* メソッド */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">メソッド</span>
          <button
            onClick={addMethod}
            className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
          >
            + 追加
          </button>
        </div>
        {cls.methods.length === 0 && (
          <p className="text-xs text-gray-400">メソッドがありません</p>
        )}
        {cls.methods.map((method) => (
          <div key={method.id} className="flex flex-col gap-0.5 border border-gray-100 rounded p-1.5 bg-gray-50">
            {/* 1段目 */}
            <div className="flex items-center gap-1">
              <select
                value={method.visibility}
                onChange={(e) => updateMethod(method.id, { visibility: e.target.value as Visibility })}
                title="可視性"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none w-24"
              >
                {(Object.keys(VIS_LABELS) as Visibility[]).map((v) => (
                  <option key={v} value={v}>{VIS_LABELS[v]}</option>
                ))}
              </select>
              <input
                value={method.name}
                onChange={(e) => updateMethod(method.id, { name: e.target.value })}
                placeholder="メソッド名"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
              />
              <button
                onClick={() => removeMethod(method.id)}
                className="text-xs text-red-400 hover:text-red-600 px-1"
                title="削除"
              >
                ✕
              </button>
            </div>
            {/* 2段目 */}
            <div className="flex items-center gap-1 flex-wrap pl-1">
              <input
                value={method.params}
                onChange={(e) => updateMethod(method.id, { params: e.target.value })}
                placeholder="引数（例: name: String, age: int）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
              />
              <input
                value={method.returnType}
                onChange={(e) => updateMethod(method.id, { returnType: e.target.value })}
                placeholder="戻り値型（例: void）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-24"
              />
              <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={method.isAbstract}
                  onChange={(e) => updateMethod(method.id, { isAbstract: e.target.checked })}
                />
                abstract
              </label>
              <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={method.isStatic}
                  onChange={(e) => updateMethod(method.id, { isStatic: e.target.checked })}
                />
                static
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
