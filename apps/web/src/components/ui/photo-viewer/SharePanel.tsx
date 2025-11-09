import { RootPortal } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { injectConfig, siteConfig } from '~/config'
import type { PhotoManifest } from '~/types/photo'

interface SharePanelProps {
  photo: PhotoManifest
  trigger: React.ReactNode
  blobSrc?: string
}

interface ShareOption {
  id: string
  label: string
  icon: string
  action: () => Promise<void> | void
  color?: string
  bgColor?: string
}

interface SocialShareOption {
  id: string
  label: string
  icon: string
  url: string
  color: string
  bgColor: string
}

export const SharePanel = ({ photo, trigger, blobSrc }: SharePanelProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  // 社交媒体分享选项
  const socialOptions: SocialShareOption[] = [
    {
      id: 'twitter',
      label: 'Twitter',
      icon: 'i-mingcute-twitter-fill',
      url: 'https://twitter.com/intent/tweet?text={text}&url={url}',
      color: 'text-white',
      bgColor: 'bg-sky-500',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: 'i-mingcute-facebook-line',
      url: 'https://www.facebook.com/sharer/sharer.php?u={url}',
      color: 'text-white',
      bgColor: 'bg-[#1877F2]',
    },
    {
      id: 'telegram',
      label: 'Telegram',
      icon: 'i-mingcute-telegram-line',
      url: 'https://t.me/share/url?url={url}&text={text}',
      color: 'text-white',
      bgColor: 'bg-[#0088CC]',
    },
    {
      id: 'weibo',
      label: t('photo.share.weibo'),
      icon: 'i-mingcute-weibo-line',
      url: 'https://service.weibo.com/share/share.php?url={url}&title={text}',
      color: 'text-white',
      bgColor: 'bg-[#E6162D]',
    },
  ]

  const handleNativeShare = useCallback(async () => {
    const shareUrl = window.location.href
    const shareTitle = photo.title || t('photo.share.default.title')
    const shareText = t('photo.share.text', { title: shareTitle })

    try {
      // 优先使用 blobSrc（转换后的图片），如果没有则使用 originalUrl
      const imageUrl = blobSrc || photo.originalUrl
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const file = new File([blob], `${photo.title || 'photo'}.jpg`, {
        type: blob.type || 'image/jpeg',
      })

      // 检查是否支持文件分享
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
          files: [file],
        })
      } else {
        // 不支持文件分享，只分享链接
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        })
      }
      setIsOpen(false)
    } catch {
      // 如果分享失败，复制链接
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('photo.share.link.copied'))
      setIsOpen(false)
    }
  }, [photo.title, blobSrc, photo.originalUrl, t])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('photo.share.link.copied'))
      setIsOpen(false)
    } catch {
      toast.error(t('photo.share.copy.failed'))
    }
  }, [t])
  const shareCodeRef = useRef<HTMLElement>(null)

  const handleCopyEmbedCode = useCallback(async () => {
    try {
      const embedCode = shareCodeRef.current?.textContent
      if (embedCode) {
        await navigator.clipboard.writeText(embedCode)
      }
      toast.success(t('photo.share.embed.copied'))
      setIsOpen(false)
    } catch {
      toast.error(t('photo.share.copy.failed'))
    }
  }, [t])

  const handleSocialShare = useCallback(
    (url: string) => {
      const shareUrl = encodeURIComponent(window.location.href)
      const defaultTitle = t('photo.share.default.title')
      const shareTitle = encodeURIComponent(photo.title || defaultTitle)
      const shareText = encodeURIComponent(t('photo.share.text', { title: photo.title || defaultTitle }))

      const finalUrl = url.replace('{url}', shareUrl).replace('{title}', shareTitle).replace('{text}', shareText)

      window.open(finalUrl, '_blank', 'width=600,height=400')
      setIsOpen(false)
    },
    [photo.title, t],
  )

  // 功能选项
  const actionOptions: ShareOption[] = [
    ...(typeof navigator !== 'undefined' && 'share' in navigator
      ? [
          {
            id: 'native-share',
            label: t('photo.share.system'),
            icon: 'i-mingcute-share-2-line',
            action: handleNativeShare,
            color: 'text-blue-500',
          },
        ]
      : []),
    {
      id: 'copy-link',
      label: t('photo.share.copy.link'),
      icon: 'i-mingcute-link-line',
      action: handleCopyLink,
    },
    {
      id: 'copy-embed',
      label: t('photo.share.embed.code'),
      icon: 'i-mingcute-code-line',
      action: handleCopyEmbedCode,
      color: 'text-purple-500',
    },
  ]

  return (
    <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>

      <AnimatePresence>
        {isOpen && (
          <RootPortal>
            <DropdownMenuPrimitive.Content
              align="end"
              sideOffset={8}
              className="z-10000 min-w-[280px] will-change-[opacity,transform]"
              asChild
            >
              <m.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={Spring.presets.smooth}
                className="border-accent/20 rounded-2xl border p-4 backdrop-blur-2xl"
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
                  boxShadow:
                    '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                {/* Inner glow layer */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{
                    background:
                      'linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))',
                  }}
                />
                {/* 标题区域 */}
                <div className="relative mb-4 text-center">
                  <h3 className="text-text font-semibold">{t('photo.share.title')}</h3>
                  {photo.title && <p className="text-text-secondary mt-1 line-clamp-1 text-sm">{photo.title}</p>}
                </div>

                {/* 社交媒体分享 - 第一排 */}
                <div className="relative mb-6">
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                      {t('photo.share.social.media')}
                    </h4>
                  </div>
                  <div className="flex gap-6 px-2">
                    {socialOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="group flex flex-col items-center gap-2"
                        onClick={() => handleSocialShare(option.url)}
                      >
                        <div
                          className={clsxm(
                            'flex size-12 items-center justify-center rounded-full transition-all duration-200',
                            option.bgColor,
                            'group-hover:scale-110 group-active:scale-95',
                            'shadow-lg',
                          )}
                        >
                          <i className={clsxm(option.icon, 'size-5', option.color)} />
                        </div>
                        <span className="text-text-secondary text-xs font-medium">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 嵌入代码 - 第二排 */}
                {injectConfig.useNext && (
                  <div className="relative mb-6">
                    <div className="mb-3">
                      <h4 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                        {t('photo.share.embed.code')}
                      </h4>
                      <p className="text-text-tertiary mt-1 text-xs">{t('photo.share.embed.description')}</p>
                    </div>
                    <div className="relative">
                      <div className="border-accent/20 bg-accent/5 rounded-lg border p-3">
                        <code
                          ref={(ref) => {
                            if (ref) {
                              shareCodeRef.current = ref
                            }
                            return () => {
                              shareCodeRef.current = null
                            }
                          }}
                          className="text-text-secondary font-mono text-xs break-all whitespace-pre select-all"
                        >
                          {`<iframe
  src="${siteConfig.url.replace(/\/$/, '')}/share/iframe?id=${photo.id}"
  style="width: 100%; aspect-ratio: ${photo.width} / ${photo.height}"
  allowTransparency
  sandbox="allow-scripts allow-same-origin allow-popups"
/>`}
                        </code>
                      </div>
                      <button
                        type="button"
                        className="glassmorphic-btn border-accent/20 bg-accent/5 absolute top-2 right-2 flex size-7 items-center justify-center rounded-md border backdrop-blur-3xl transition-all duration-200"
                        onClick={handleCopyEmbedCode}
                      >
                        <i className="i-mingcute-copy-line size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 功能选项 - 第三排 */}
                <div className="relative">
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                      {t('photo.share.actions')}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {actionOptions
                      .filter((option) => option.id !== 'copy-embed')
                      .map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="glassmorphic-btn group relative flex cursor-pointer items-center rounded-lg px-2 py-2 text-sm transition-all duration-200 outline-none select-none"
                          onClick={() => option.action()}
                        >
                          <div className="flex items-center gap-2">
                            <div className="bg-accent/10 flex size-7 items-center justify-center rounded-full transition-colors duration-200">
                              <i className={clsxm(option.icon, 'size-3.5', option.color || 'text-text-secondary')} />
                            </div>
                            <span className="text-text text-xs font-medium">{option.label}</span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </m.div>
            </DropdownMenuPrimitive.Content>
          </RootPortal>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  )
}
