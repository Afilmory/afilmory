import { LinearBlur } from '@afilmory/ui'

import siteConfig from '~/../../site.config'

export const PageFooter = () => {
  const { beian } = siteConfig

  // 如果 ICP 和公安备案都未启用，不渲染组件
  const showICP = beian?.icp?.enabled && beian?.icp?.number
  const showPolice = beian?.police?.enabled && beian?.police?.number

  if (!showICP && !showPolice) {
    return null
  }

  // 是否显示两行（同时启用 ICP 和公安备案）
  const isTwoLine = showICP && showPolice

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-100">
      <LinearBlur
        className="absolute inset-x-0 bottom-0 z-[-1] h-20"
        tint="var(--color-background)"
        strength={isTwoLine ? 96 : 128}
        falloffPercentage={100}
        side="bottom"
      />

      <div
        className={`pointer-events-auto flex items-center justify-center gap-1 px-3 lg:px-4 ${
          isTwoLine ? 'h-16 flex-col lg:h-16' : 'h-10 lg:h-10'
        }`}
      >
        {/* 公安备案 */}
        {showPolice && (
          <div className="flex items-center gap-1.5">
            {beian?.police?.icon && <img src={beian?.police?.icon} alt="公安备案图标" className="size-4" />}
            <a
              href={
                beian?.police?.code
                  ? `https://beian.mps.gov.cn/#/query/webSearch?code=${beian?.police?.code}`
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/60 transition-colors duration-200 hover:text-white"
            >
              {beian?.police?.number}
            </a>
          </div>
        )}

        {/* ICP备案 */}
        {showICP && (
          <a
            href={beian?.icp?.link || 'https://beian.miit.gov.cn/'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/60 transition-colors duration-200 hover:text-white"
          >
            {beian?.icp?.number}
          </a>
        )}
      </div>
    </footer>
  )
}
