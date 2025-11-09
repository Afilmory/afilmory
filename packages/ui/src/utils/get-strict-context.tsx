import { createContext, use } from 'react'

export function getStrictContext<T>(
  name?: string,
): readonly [({ value, children }: { value: T; children?: React.ReactNode }) => React.JSX.Element, () => T] {
  const Context = createContext<T | undefined>(undefined)

  const Provider = ({ value, children }: { value: T; children?: React.ReactNode }) => (
    <Context value={value}>{children}</Context>
  )

  const useSafeContext = () => {
    const ctx = use(Context)
    if (ctx === undefined) {
      throw new Error(`useContext must be used within ${name ?? 'a Provider'}`)
    }
    return ctx
  }

  return [Provider, useSafeContext] as const
}
