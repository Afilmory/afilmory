import type { FC, PropsWithChildren } from 'react'
import { Fragment } from 'react'

export const PassiveFragment: FC<PropsWithChildren> = ({ children, ...rest }) => (
  <Fragment {...rest}>{children}</Fragment>
)
