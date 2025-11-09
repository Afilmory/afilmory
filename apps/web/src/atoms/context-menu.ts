import { atom } from 'jotai'
import { useCallback } from 'react'

import { createAtomHooks } from '~/lib/jotai'

// Atom

type ContextMenuState =
  | { open: false }
  | {
      open: true
      position: { x: number; y: number }
      menuItems: FollowMenuItem[]
      // Just for abort callback
      // Also can be optimized by using the `atomWithListeners`
      abortController: AbortController
    }

export const [contextMenuAtom, useContextMenuState, useContextMenuValue, useSetContextMenu] = createAtomHooks(
  atom<ContextMenuState>({ open: false }),
)

const useShowWebContextMenu = () => {
  const setContextMenu = useSetContextMenu()

  const showWebContextMenu = useCallback(
    async (menuItems: Array<FollowMenuItem>, e: MouseEvent | React.MouseEvent) => {
      const abortController = new AbortController()
      const resolvers = Promise.withResolvers<void>()
      setContextMenu({
        open: true,
        position: { x: e.clientX, y: e.clientY },
        menuItems,
        abortController,
      })

      abortController.signal.addEventListener('abort', () => {
        resolvers.resolve()
      })
      return resolvers.promise
    },
    [setContextMenu],
  )

  return showWebContextMenu
}

// Menu

export type FollowMenuItem = MenuItemText | MenuItemSeparator

export type MenuItemInput = MenuItemText | MenuItemSeparator | NilValue

function filterNullableMenuItems(items: MenuItemInput[]): FollowMenuItem[] {
  return items
    .filter((item) => item !== null && item !== undefined && item !== false && item !== '')
    .filter((item) => !item.hide)
    .map((item) => {
      if (item instanceof MenuItemSeparator) {
        return MENU_ITEM_SEPARATOR
      }

      if (item.submenu && item.submenu.length > 0) {
        return item.extend({
          submenu: filterNullableMenuItems(item.submenu),
        })
      }

      return item
    })
}

export enum MenuItemType {
  Separator,
  Action,
}

export const useShowContextMenu = () => {
  const showWebContextMenu = useShowWebContextMenu()

  const showContextMenu = useCallback(
    async (inputMenu: Array<MenuItemInput>, e: MouseEvent | React.MouseEvent) => {
      const menuItems = filterNullableMenuItems(inputMenu)
      e.preventDefault()
      e.stopPropagation()
      await showWebContextMenu(menuItems, e)
    },
    [showWebContextMenu],
  )

  return showContextMenu
}

export class MenuItemSeparator {
  readonly type = MenuItemType.Separator
  constructor(public hide = false) {}
  static default = new MenuItemSeparator()
}

const noop = () => void 0
export type BaseMenuItemTextConfig = {
  label: string
  click?: () => void
  /** only work in web app */
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  supportMultipleSelection?: boolean
}

export class BaseMenuItemText {
  readonly type = MenuItemType.Action

  private __sortedShortcut: string | null = null

  constructor(private configs: BaseMenuItemTextConfig) {
    this.__sortedShortcut = this.configs.shortcut || null
  }

  public get label() {
    return this.configs.label
  }

  public get click() {
    return this.configs.click?.bind(this.configs) || noop
  }

  public get onClick() {
    return this.click
  }
  public get icon() {
    return this.configs.icon
  }

  public get shortcut() {
    return this.__sortedShortcut
  }

  public get disabled() {
    return this.configs.disabled || false
  }

  public get checked() {
    return this.configs.checked
  }

  public get supportMultipleSelection() {
    return this.configs.supportMultipleSelection
  }
}

export type MenuItemTextConfig = BaseMenuItemTextConfig & {
  hide?: boolean
  submenu?: MenuItemInput[]
}

export class MenuItemText extends BaseMenuItemText {
  protected __submenu: FollowMenuItem[]
  constructor(protected config: MenuItemTextConfig) {
    super(config)

    this.__submenu = this.config.submenu ? filterNullableMenuItems(this.config.submenu) : []
  }

  public get submenu() {
    return this.__submenu
  }

  public get hide() {
    return this.config.hide || false
  }

  extend(config: Partial<MenuItemTextConfig>) {
    return new MenuItemText({
      ...this.config,
      ...config,
    })
  }
}
export const MENU_ITEM_SEPARATOR = MenuItemSeparator.default
