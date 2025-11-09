/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { FC, PropsWithChildren } from 'react'

declare global {
  export type NextErrorProps = {
    reset: () => void
    error: Error
  }
  export type NextPageParams<P extends {}, Props = {}> = PropsWithChildren<
    {
      params: Promise<P>
      searchParams: Promise<Record<string, string | string[] | undefined>>
    } & Props
  >

  export type NextPageExtractedParams<P extends {}, Props = {}> = PropsWithChildren<
    {
      params: P
      searchParams: Promise<Record<string, string | string[] | undefined>>
    } & Props
  >

  export type Component<P = {}> = FC<ComponentType & P>

  export type ComponentType<P = {}> = {
    className?: string
  } & PropsWithChildren &
    P
}

declare module 'react' {
  export interface AriaAttributes {
    'data-hide-print'?: boolean
    'data-event'?: string
    'data-testid'?: string
  }
}
