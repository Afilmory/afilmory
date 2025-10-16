import { Drawer } from 'vaul'

import { ViewPanel } from './panels/ViewPanel'

const panelMap = {
  view: ViewPanel,
}

export type PanelType = keyof typeof panelMap

export const ActionPanel = ({
  open,
  onOpenChange,
  type,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: PanelType | null
}) => {
  const Panel = type ? panelMap[type] : null
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
        <Drawer.Content className="fixed right-0 bottom-0 left-0 z-50 flex flex-col rounded-t-2xl border-t border-zinc-200 bg-white/80 p-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-black/80">
          <div className="mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          {Panel && <Panel />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
