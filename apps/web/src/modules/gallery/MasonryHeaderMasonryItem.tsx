import { clsxm } from '@afilmory/utils'
import { repository } from '@pkg'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { useTranslation } from 'react-i18next'

import { siteConfig } from '~/config'
import { usePhotos } from '~/hooks/usePhotoViewer'

import { ActionGroup } from './ActionGroup'

function resolveSocialUrl(
  value: string,
  { baseUrl, stripAt }: { baseUrl: string; stripAt?: boolean },
): string | undefined {
  const trimmed = value.trim()

  if (!trimmed) {
    return undefined
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  const normalized = stripAt ? trimmed.replace(/^@/, '') : trimmed
  if (!normalized) {
    return undefined
  }
  return `${baseUrl}${normalized}`
}

export const MasonryHeaderMasonryItem = ({ style, className }: { style?: React.CSSProperties; className?: string }) => {
  const { t } = useTranslation()
  const { i18n } = useTranslation()
  const visiblePhotoCount = usePhotos().length
  const githubUrl =
    siteConfig.social && siteConfig.social.github
      ? resolveSocialUrl(siteConfig.social.github, { baseUrl: 'https://github.com/' })
      : undefined
  const twitterUrl =
    siteConfig.social && siteConfig.social.twitter
      ? resolveSocialUrl(siteConfig.social.twitter, { baseUrl: 'https://twitter.com/', stripAt: true })
      : undefined

  return (
    <div
      className={clsxm(
        'overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
      style={style}
    >
      {/* Header section with clean typography */}
      <div className="px-6 pt-8 pb-6 text-center">
        <div className="flex items-center justify-center">
          <div className="relative">
            {siteConfig.author.avatar && (
              <AvatarPrimitive.Root>
                <AvatarPrimitive.Image src={siteConfig.author.avatar} className="size-16 rounded-full" />
                <AvatarPrimitive.Fallback>
                  <div className="bg-material-medium size-16 rounded-full" />
                </AvatarPrimitive.Fallback>
              </AvatarPrimitive.Root>
            )}
            <div
              className={clsxm(
                'from-accent to-accent/80 inline-flex items-center justify-center rounded-2xl bg-linear-to-br shadow-lg',
                siteConfig.author.avatar ? 'size-8 rounded absolute bottom-0 -right-3' : 'size-16 mb-4',
              )}
            >
              <i className="i-mingcute-camera-2-line text-2xl text-white" />
            </div>
          </div>
        </div>

        <h2 className="mt-1 mb-1 text-2xl font-semibold text-gray-900 dark:text-white">{siteConfig.name}</h2>

        {/* Social media links */}
        {siteConfig.social && (
          <div className="mt-1 mb-3 flex items-center justify-center gap-3">
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary flex items-center justify-center p-2 duration-200 hover:text-[#E7E8E8]"
                title="GitHub"
              >
                <i className="i-mingcute-github-fill text-sm" />
              </a>
            )}
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary flex items-center justify-center p-2 duration-200 hover:text-[#1da1f2]"
                title="Twitter"
              >
                <i className="i-mingcute-twitter-fill text-sm" />
              </a>
            )}
            {siteConfig.social.rss && (
              <a
                href="/feed.xml"
                target="_blank"
                className="text-text-secondary flex items-center justify-center p-2 duration-200 hover:text-[#ec672c]"
                title="RSS"
              >
                <i className="i-mingcute-rss-2-fill text-sm" />
              </a>
            )}
          </div>
        )}

        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('gallery.photos', { count: visiblePhotoCount || 0 })}
        </p>
      </div>

      {/* Controls section */}
      <div className="px-6 pb-6">
        <ActionGroup />
      </div>

      {/* Footer with build date */}
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <i className="i-mingcute-calendar-line text-sm" />
          <span>
            {t('gallery.built.at')}
            {new Date(BUILT_DATE).toLocaleDateString(i18n.language, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            {GIT_COMMIT_HASH && (
              <span className="ml-1">
                (
                <a
                  href={`${repository.url}/commit/${GIT_COMMIT_HASH}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-500 dark:text-gray-400"
                >
                  {GIT_COMMIT_HASH.slice(0, 6)}
                </a>
                )
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
