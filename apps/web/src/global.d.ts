import type { SiteConfig } from '@config'
import type { AfilmoryManifest } from '@packages/builder/src/types/manifest'
import type { FC, PropsWithChildren } from 'react'

import type { InjectConfig } from './config/types'

declare global {
  export type Nullable<T> = T | null | undefined

  type IsLiteralString<T> = T extends string ? (string extends T ? never : T) : never

  type OmitStringType<T> = T extends any[] ? OmitStringType<T[number]> : IsLiteralString<T>
  type NonUndefined<T> = T extends undefined ? never : T extends object ? { [K in keyof T]: NonUndefined<T[K]> } : T

  type NilValue = null | undefined | false | ''
  type Prettify<T> = {
    [K in keyof T]: T[K]
  } & {}

  const APP_NAME: string
  const BUILT_DATE: string
  const GIT_COMMIT_HASH: string

  const __MANIFEST__: AfilmoryManifest
  const __SITE_CONFIG__: Partial<SiteConfig>

  const __CONFIG__: InjectConfig
  /**
   * This function is a macro, will replace in the build stage.
   */
  export function tw(strings: TemplateStringsArray, ...values: any[]): string

  interface Window {
    __SITE_CONFIG__?: Partial<SiteConfig>
  }
}

declare global {
  export type Component<P = object> = FC<Prettify<ComponentType & P>>

  export type ComponentWithRef<P = object, Ref = object> = FC<ComponentWithRefType<P, Ref>>
  export type ComponentWithRefType<P = object, Ref = object> = Prettify<
    ComponentType<P> & {
      ref?: React.Ref<Ref>
    }
  >

  export type ComponentType<P = object> = {
    className?: string
  } & PropsWithChildren &
    P
}

declare module 'react' {
  export interface AriaAttributes {
    'data-testid'?: string
    'data-hide-in-print'?: boolean
  }
}
