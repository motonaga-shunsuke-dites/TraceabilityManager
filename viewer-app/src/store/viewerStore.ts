import { create } from 'zustand'
import type { LinkNode, Roots, ContentState } from '../types'

export type ViewMode = 'view' | 'edit'

export interface PaneVisible {
  spec: boolean
  design: boolean
  source: boolean
}

interface ViewerState {
  mode: ViewMode
  projectPath: string | null
  nodes: LinkNode[]
  roots: Roots
  selectedNodeId: string | null
  content: ContentState
  editingSpec: string | null
  editingDesign: string | null
  paneVisible: PaneVisible

  setMode: (mode: ViewMode) => void
  setProjectPath: (path: string | null) => void
  setNodes: (nodes: LinkNode[]) => void
  setRoots: (roots: Roots) => void
  setSelectedNodeId: (id: string | null) => void
  setContent: (content: ContentState) => void
  setEditingSpec: (text: string | null) => void
  setEditingDesign: (text: string | null) => void
  togglePane: (key: keyof PaneVisible) => void
  setPaneVisible: (pv: PaneVisible) => void
  addNode: (node: LinkNode) => void
  updateNode: (id: string, patch: Partial<LinkNode>) => void
  removeNode: (id: string) => void
  resetProject: () => void
}

const initialRoots: Roots = { spec: '', design: '', source: '' }

export const initialContent: ContentState = {
  activeLinkId: null,
  specPath: null,
  specContent: null,
  specHeading: null,
  designPath: null,
  designContent: null,
  designHeading: null,
  sourcePaths: [],
  sourceContents: []
}

export const useViewerStore = create<ViewerState>()(
  (set) => ({
    mode: 'view',
    projectPath: null,
    nodes: [],
    roots: initialRoots,
    selectedNodeId: null,
    content: initialContent,
    editingSpec: null,
    editingDesign: null,
    paneVisible: { spec: true, design: true, source: true },

    setMode: (mode) => set({ mode }),
    setProjectPath: (path) => set({ projectPath: path }),
    setNodes: (nodes) => set({ nodes }),
    setRoots: (roots) => set({ roots }),
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    setContent: (content) => set({ content }),
    setEditingSpec: (text) => set({ editingSpec: text }),
    setEditingDesign: (text) => set({ editingDesign: text }),
    togglePane: (key) => set((s) => ({ paneVisible: { ...s.paneVisible, [key]: !s.paneVisible[key] } })),
    setPaneVisible: (pv) => set({ paneVisible: pv }),

    addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
    updateNode: (id, patch) =>
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
      })),
    removeNode: (id) =>
      set((s) => {
        const toRemove = new Set<string>()
        const collect = (nodeId: string): void => {
          toRemove.add(nodeId)
          s.nodes.filter((n) => n.parent === nodeId).forEach((n) => collect(n.id))
        }
        collect(id)
        return { nodes: s.nodes.filter((n) => !toRemove.has(n.id)) }
      }),
    resetProject: () =>
      set({
        projectPath: null,
        nodes: [],
        roots: initialRoots,
        selectedNodeId: null,
        content: initialContent,
        editingSpec: null,
        editingDesign: null
      })
  })
)
