import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@afilmory/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { LogIn, LogOut, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Drawer } from 'vaul'

import { gallerySettingAtom, isCommandPaletteOpenAtom } from '~/atoms/app'
import { sessionMembershipAtom, sessionUserAtom } from '~/atoms/session'
import { injectConfig, siteConfig } from '~/config'
import { useMobile } from '~/hooks/useMobile'
import { authApi, canAccessDashboard } from '~/lib/api/auth'

import { UserAvatar } from '../../social/comments/UserAvatar'
import { ViewPanel } from '../panels/ViewPanel'
import { ActionIconButton, resolveSocialUrl } from './utils'

export const PageHeaderRight = () => {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const [gallerySetting] = useAtom(gallerySettingAtom)
  const setCommandPaletteOpen = useSetAtom(isCommandPaletteOpenAtom)
  const navigate = useNavigate()
  const sessionUser = useAtomValue(sessionUserAtom)

  // 计算视图设置是否有自定义配置
  const hasViewCustomization = gallerySetting.columns !== 'auto' || gallerySetting.sortOrder !== 'desc'

  // 计算过滤器数量
  const filterCount
    = gallerySetting.selectedTags.length
      + gallerySetting.selectedCameras.length
      + gallerySetting.selectedLenses.length
      + (gallerySetting.selectedRatings !== null ? 1 : 0)

  return (
    <div className="flex items-center gap-1 lg:gap-1.5">
      {/* Action Buttons */}
      <div className="bg-material-medium/40 flex items-center gap-1 rounded-lg">
        <ActionIconButton
          icon="i-mingcute-search-line"
          title={t('action.search.unified.title')}
          onClick={() => setCommandPaletteOpen(true)}
          badge={filterCount}
        />

        {/* Desktop only: Map Link */}
        {!isMobile && (
          <ActionIconButton
            icon="i-mingcute-map-pin-line"
            title={t('action.map.explore')}
            onClick={() => navigate('/explory')}
          />
        )}

        {isMobile ? (
          <MobileViewButton
            icon="i-mingcute-layout-grid-line"
            title={t('action.view.title')}
            badge={hasViewCustomization ? '●' : undefined}
          >
            <ViewPanel />
          </MobileViewButton>
        ) : (
          <DesktopViewButton
            icon="i-mingcute-layout-grid-line"
            title={t('action.view.title')}
            badge={hasViewCustomization ? '●' : undefined}
          >
            <ViewPanel />
          </DesktopViewButton>
        )}

        {isMobile && <MoreActionMenu />}
      </div>

      {/* Auth Section - Only show when useCloud is true */}
      {injectConfig.useCloud && (
        <div className={`bg-material-medium/40 flex items-center gap-1 ${sessionUser ? 'rounded-full' : 'rounded-lg'}`}>
          {sessionUser ? <UserMenuButton user={sessionUser} /> : <LoginButton />}
        </div>
      )}
    </div>
  )
}

const MoreActionMenu = () => {
  const { t } = useTranslation()
  const [settings, setSettings] = useAtom(gallerySettingAtom)

  const githubUrl
    = siteConfig.social && siteConfig.social.github
      ? resolveSocialUrl(siteConfig.social.github, { baseUrl: 'https://github.com/' })
      : undefined
  const twitterUrl
    = siteConfig.social && siteConfig.social.twitter
      ? resolveSocialUrl(siteConfig.social.twitter, { baseUrl: 'https://twitter.com/', stripAt: true })
      : undefined
  const hasRss = true

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-7 items-center justify-center rounded text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="More options"
        >
          <i className="i-mingcute-more-2-line text-lg" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <div className="px-2 py-1.5 text-xs font-medium text-white/50">{t('action.view.title')}</div>
        <DropdownMenuItem
          onClick={() => setSettings(prev => ({ ...prev, viewMode: 'masonry' }))}
          className="justify-between"
        >
          <span className="flex items-center gap-2">
            <i className="i-mingcute-grid-line text-base" />
            {t('gallery.view.masonry')}
          </span>
          {settings.viewMode === 'masonry' && <i className="i-mingcute-check-line text-base" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setSettings(prev => ({ ...prev, viewMode: 'list' }))}
          className="justify-between"
        >
          <span className="flex items-center gap-2">
            <i className="i-mingcute-list-ordered-line text-base" />
            {t('gallery.view.list')}
          </span>
          {settings.viewMode === 'list' && <i className="i-mingcute-check-line text-base" />}
        </DropdownMenuItem>

        {(githubUrl || twitterUrl || hasRss) && <DropdownMenuSeparator />}

        {githubUrl && (
          <DropdownMenuItem asChild>
            <a href={githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <i className="i-mingcute-github-fill text-base" />
              GitHub
            </a>
          </DropdownMenuItem>
        )}
        {twitterUrl && (
          <DropdownMenuItem asChild>
            <a href={twitterUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <i className="i-mingcute-twitter-fill text-base" />
              Twitter
            </a>
          </DropdownMenuItem>
        )}
        {hasRss && (
          <DropdownMenuItem asChild>
            <a href="/feed.xml" target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <i className="i-mingcute-rss-2-fill text-base" />
              RSS
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 紧凑版本的桌面端视图按钮
const DesktopViewButton = ({
  icon,
  title,
  badge,
  children,
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-7 items-center justify-center rounded-full text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:size-8"
          title={title}
          aria-label={title}
        >
          <i className={`${icon} text-sm lg:text-base`} aria-hidden="true" />
          {badge && (
            <span className="absolute -top-0.5 -right-0.5 flex size-2 items-center justify-center rounded-full bg-blue-500 lg:size-2.5">
              <span className="sr-only">{badge}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

// 紧凑版本的移动端视图按钮
const MobileViewButton = ({
  icon,
  title,
  badge,
  children,
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="relative flex size-7 items-center justify-center rounded text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:size-8"
        title={title}
        aria-label={title}
        onClick={() => setOpen(!open)}
      >
        <i className={`${icon} text-sm lg:text-base`} aria-hidden="true" />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 flex size-2 items-center justify-center rounded-full bg-blue-500 lg:size-2.5">
            <span className="sr-only">{badge}</span>
          </span>
        )}
      </button>
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
          <Drawer.Content className="fixed right-0 bottom-0 left-0 z-50 flex flex-col rounded-t-2xl border-t border-zinc-200 bg-white/80 p-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-black/80">
            <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            {children}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

// 登录按钮
const LoginButton = () => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const { data: socialProviders } = useQuery({
    queryKey: ['socialProviders'],
    queryFn: authApi.getSocialProviders,
    enabled: isOpen,
  })

  const handleSignIn = async (provider: string) => {
    try {
      const { url } = await authApi.signInSocial(provider)
      window.location.href = url
    }
    catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-7 items-center justify-center rounded text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:size-8"
          title={t('action.login')}
          aria-label={t('action.login')}
        >
          <LogIn className="size-3.5 lg:size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5 text-xs text-white/50">{t('comments.chooseProvider')}</div>
        <DropdownMenuSeparator />
        {socialProviders?.providers.map(provider => (
          <DropdownMenuItem
            key={provider.id}
            onClick={() => handleSignIn(provider.id)}
            icon={<LoginPlatformIcon provider={provider.id} />}
          >
            {t('comments.signInWith', { provider: provider.name })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 登录平台图标
const LoginPlatformIcon = ({ provider }: { provider: string }) => {
  switch (provider) {
    case 'apple': {
      return <i className="i-simple-icons-apple text-base" />
    }
    case 'github': {
      return <i className="i-simple-icons-github text-base" />
    }
    case 'google': {
      return (
        <svg className="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 262">
          <path
            fill="#4285F4"
            d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
          />
          <path
            fill="#34A853"
            d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
          />
          <path
            fill="#FBBC05"
            d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
          />
          <path
            fill="#EB4335"
            d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
          />
        </svg>
      )
    }
    default: {
      return <User className="size-4" />
    }
  }
}

// 用户菜单按钮
const UserMenuButton = ({
  user,
}: {
  user: { id: string, name?: string | null, image?: string | null, role?: string | null }
}) => {
  const { t } = useTranslation()
  const setSessionUser = useSetAtom(sessionUserAtom)
  const setSessionMembership = useSetAtom(sessionMembershipAtom)
  const requestedMembership = useAtomValue(sessionMembershipAtom)
  const queryClient = useQueryClient()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const showDashboard = canAccessDashboard({ user, requestedMembership })

  const handleSignOut = async () => {
    if (isSigningOut) {
      return
    }
    setIsSigningOut(true)
    try {
      await authApi.signOut()
      setSessionUser(null)
      setSessionMembership(null)
      await queryClient.invalidateQueries({ queryKey: ['session'] })
    }
    catch (error) {
      console.error('Sign out failed:', error)
    }
    finally {
      setIsSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-7 items-center justify-center rounded text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:size-8"
          title={user.name || user.id}
          aria-label={`User menu: ${user.name || user.id}`}
        >
          <UserAvatar image={user.image} name={user.name || user.id} fallback="?" size={28} className="lg:size-8" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5">
          <div className="text-sm font-medium text-white/90">{user.name || user.id}</div>
        </div>
        <DropdownMenuSeparator />
        {showDashboard && (
          <DropdownMenuItem
            onClick={() => {
              window.location.href = '/platform'
            }}
            icon={<i className="i-mingcute-settings-3-line text-base" />}
          >
            {t('action.dashboard')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleSignOut} icon={<LogOut className="size-4" />} disabled={isSigningOut}>
          {t('action.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
