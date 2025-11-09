import { clsxm } from '@afilmory/utils'

export const LinearDivider: Component = ({ className }) => {
  return <div className={clsxm('via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent', className)} />
}
