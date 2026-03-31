import { useCallback, useMemo } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { loadLinkContent } from '../../utils/nodes'
import type { DocLink } from '../../types'

export function LinkTabs(): JSX.Element | null {
  const nodes = useViewerStore((s) => s.nodes)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const roots = useViewerStore((s) => s.roots)
  const content = useViewerStore((s) => s.content)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )
  const links: DocLink[] = node?.links ?? []

  const handleSwitch = useCallback(
    async (link: DocLink) => {
      const state = await loadLinkContent(link, roots, content)
      setContent(state)
      setEditingSpec(state.specContent)
      setEditingDesign(state.designContent)
    },
    [roots, content, setContent, setEditingSpec, setEditingDesign]
  )

  if (links.length <= 1) return null

  return (
    <div className="flex items-center overflow-x-auto border-b border-gray-200 bg-gray-50 shrink-0">
      <span className="px-2 text-xs text-gray-400 shrink-0">紐づけ:</span>
      {links.map((link) => (
        <button
          key={link.id}
          onClick={() => handleSwitch(link)}
          className={[
            'px-3 py-1.5 text-xs whitespace-nowrap border-r border-gray-200 transition-colors',
            content.activeLinkId === link.id
              ? 'bg-white font-semibold text-blue-600 border-b-2 border-b-blue-500'
              : 'text-gray-500 hover:bg-gray-100'
          ].join(' ')}
        >
          {link.label}
        </button>
      ))}
    </div>
  )
}
