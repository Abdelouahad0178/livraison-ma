import { createContext, useContext } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AgentCtx = createContext<any>(null)

export const useAgentCtx = () => {
  const ctx = useContext(AgentCtx)
  if (!ctx) throw new Error('useAgentCtx must be used within AgentCtx.Provider')
  return ctx
}
