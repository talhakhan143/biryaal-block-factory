import { createContext, useContext, useState, type ReactNode } from 'react'

export type Workspace = 'factory' | 'reseller'

const KEY = 'bf_workspace'

interface WorkspaceContextValue {
  workspace: Workspace
  setWorkspace: (w: Workspace) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue>(null!)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(
    () => (localStorage.getItem(KEY) as Workspace) || 'factory',
  )

  const setWorkspace = (w: Workspace) => {
    localStorage.setItem(KEY, w)
    setWorkspaceState(w)
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  return useContext(WorkspaceContext)
}
