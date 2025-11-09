import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type HeaderActionState = {
  disabled: boolean
  loading: boolean
}

const defaultHeaderActionState: HeaderActionState = {
  disabled: false,
  loading: false,
}

type MainPageLayoutContextValue = {
  headerActionsContainer: HTMLDivElement | null
  headerActionState: HeaderActionState
  setHeaderActionState: Dispatch<SetStateAction<HeaderActionState>>
  registerPortalPresence: (mounted: boolean) => void
}

const MainPageLayoutContext = createContext<MainPageLayoutContextValue | null>(null)

export function useMainPageLayout() {
  const context = use(MainPageLayoutContext)

  if (!context) {
    throw new Error('useMainPageLayout must be used within MainPageLayout')
  }

  return context
}

type MainPageLayoutProps = {
  title: string
  description?: string
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

function MainPageLayoutBase({ title, description, actions, footer, children }: MainPageLayoutProps) {
  const [headerActionsContainer, setHeaderActionsContainer] = useState<HTMLDivElement | null>(null)
  const [portalMountCount, setPortalMountCount] = useState(0)
  const [headerActionState, setHeaderActionState] = useState<HeaderActionState>(defaultHeaderActionState)

  const registerPortalPresence = useCallback((mounted: boolean) => {
    setPortalMountCount((count) => count + (mounted ? 1 : -1))
  }, [])

  const assignActionsContainer = useCallback((node: HTMLDivElement | null) => {
    setHeaderActionsContainer(node)
  }, [])

  const contextValue = useMemo<MainPageLayoutContextValue>(
    () => ({
      headerActionsContainer,
      headerActionState,
      setHeaderActionState,
      registerPortalPresence,
    }),
    [headerActionsContainer, headerActionState, registerPortalPresence],
  )

  const showHeaderActions = Boolean(actions) || portalMountCount > 0

  return (
    <MainPageLayoutContext value={contextValue}>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={Spring.presets.smooth}
        className="mt-8 space-y-6"
      >
        {/* Header - Sharp edges with gradient borders */}
        <header className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Linear gradient borders */}

          <div className="relative space-y-1.5">
            <h1 className="text-text text-2xl font-semibold">{title}</h1>
            {description ? <p className="text-text-secondary text-sm">{description}</p> : null}
          </div>

          {showHeaderActions ? (
            <div className="relative flex flex-wrap items-center gap-2 md:justify-end">
              {actions}
              <div ref={assignActionsContainer} className="flex flex-wrap items-center gap-2" />
            </div>
          ) : (
            <div ref={assignActionsContainer} className="relative hidden flex-wrap items-center gap-2 md:flex" />
          )}
        </header>

        <section>{children}</section>

        {footer ? (
          <footer className="relative py-4">
            <div className="relative">{footer}</div>
          </footer>
        ) : null}
      </m.div>
    </MainPageLayoutContext>
  )
}

type MainPageLayoutActionsProps = {
  children: ReactNode
}

function MainPageLayoutActions({ children }: MainPageLayoutActionsProps) {
  const { headerActionsContainer, registerPortalPresence } = useMainPageLayout()

  useEffect(() => {
    registerPortalPresence(true)

    return () => {
      registerPortalPresence(false)
    }
  }, [registerPortalPresence])

  if (!headerActionsContainer) {
    return null
  }

  return createPortal(children, headerActionsContainer)
}

export const MainPageLayout = Object.assign(MainPageLayoutBase, {
  Actions: MainPageLayoutActions,
})
