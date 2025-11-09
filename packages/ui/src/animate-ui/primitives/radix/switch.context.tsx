'use client'

import * as React from 'react'

export type SwitchContextType = {
  isChecked: boolean
  setIsChecked: (isChecked: boolean) => void
  isPressed: boolean
  setIsPressed: (isPressed: boolean) => void
  captureBaselineRef: React.MutableRefObject<(() => void) | null>
}

const SwitchContext = React.createContext<SwitchContextType | null>(null)

export function useSwitch(): SwitchContextType {
  const ctx = React.use(SwitchContext)
  if (!ctx) {
    throw new Error('Switch components must be used within SwitchProvider')
  }
  return ctx
}

export function SwitchProvider({ value, children }: { value: SwitchContextType; children: React.ReactNode }) {
  return <SwitchContext value={value}>{children}</SwitchContext>
}
