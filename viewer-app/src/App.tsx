import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { MainLayout } from './components/Layout/MainLayout'
import { useViewerStore } from './store/viewerStore'
import type { ViewerProject } from './types'
import { migrateNodes } from './utils/nodes'

function App(): JSX.Element {
  const setProjectPath = useViewerStore((s) => s.setProjectPath)
  const setNodes = useViewerStore((s) => s.setNodes)
  const setRoots = useViewerStore((s) => s.setRoots)

  // 起動時に前回のプロジェクトを自動復元
  useEffect(() => {
    const restore = async (): Promise<void> => {
      const lastPath = await window.api.storeGet('lastProjectPath')
      if (typeof lastPath !== 'string') return

      const res = await window.api.readToml(lastPath)
      if (!res.ok || !res.data) return

      const project = res.data as ViewerProject
      setProjectPath(lastPath)
      setRoots(project.roots ?? { spec: '', design: '', source: '' })
      setNodes(migrateNodes(project.nodes ?? []))
      toast.info('前回のプロジェクトを復元しました')
    }
    restore()
  }, [setProjectPath, setRoots, setNodes])

  return (
    <>
      <MainLayout />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}

export default App
