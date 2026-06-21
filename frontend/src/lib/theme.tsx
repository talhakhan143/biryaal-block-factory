import { type ReactNode } from 'react'

// Single light theme only — dark mode removed. Provider kept as a no-op so
// existing imports stay valid; it just renders children.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
