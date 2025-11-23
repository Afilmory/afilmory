import { createContext, use } from 'react'

interface NavigationContextValue {
  navigate: (path: string) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({
  children,
  navigate,
}: {
  children: React.ReactNode
  navigate: (path: string) => void
}) {
  return <NavigationContext value={{ navigate }}>{children}</NavigationContext>
}

export function useNavigation() {
  const context = use(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}
