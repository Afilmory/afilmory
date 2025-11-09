import { Button } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import type en from '@locales/app/en.json'
import { AnimatePresence, m, useAnimation } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type TranslationKeys = keyof typeof en

const actions: {
  id: 'view'
  icon: string
  title: TranslationKeys
}[] = [
  {
    id: 'view',
    icon: 'i-mingcute-settings-3-line',
    title: 'action.view.settings',
  },
] as const

export type ActionType = (typeof actions)[number]['id']

const GlassButton = (props: React.ComponentProps<typeof Button>) => (
  <Button
    {...props}
    className={clsxm(
      'rounded-full border-white/20 !bg-black/70 p-3 shadow-2xl backdrop-blur-2xl',
      'h-14 w-14 border',
      'bg-gradient-to-br from-white/20 to-white/0',
      'transition-colors duration-300 hover:border-white/30 hover:bg-black/10',
      props.className,
    )}
  />
)

export const FloatingActionButton = ({
  isVisible,
  onActionClick,
}: {
  isVisible: boolean
  onActionClick?: (action: ActionType) => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation()
  const controls = useAnimation()

  useEffect(() => {
    if (isOpen) {
      controls.start('visible')
    } else {
      controls.start('hidden')
    }
  }, [isOpen, controls])

  const staggerVariants = {
    visible: {
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
    hidden: {
      transition: {
        staggerChildren: 0.05,
        staggerDirection: -1,
      },
    },
  }

  const itemVariants = {
    visible: (i: number) => {
      const angle = Math.PI / 2 + (i * Math.PI) / 2 / (actions.length - 1)
      return {
        opacity: 1,
        x: Math.cos(angle) * 90,
        y: -Math.sin(angle) * 90,
        transition: { ...Spring.presets.bouncy },
      }
    },
    hidden: {
      opacity: 0,
      x: 0,
      y: 0,
      transition: { ...Spring.presets.bouncy },
    },
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          className="fixed right-4 bottom-6 z-50"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={Spring.presets.snappy}
        >
          <svg width="0" height="0" className="absolute" style={{ visibility: 'hidden' }}>
            <defs>
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -7"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </defs>
          </svg>

          <m.div
            className="relative flex flex-col items-center"
            style={{ filter: 'url(#goo)' }}
            initial="hidden"
            animate={controls}
            variants={staggerVariants}
          >
            {actions.map((action, i) => (
              <m.div key={action.id} custom={i} variants={itemVariants} className="absolute bottom-0">
                <GlassButton
                  title={t(action.title)}
                  onClick={() => {
                    onActionClick?.(action.id)
                    // setIsOpen(false)
                  }}
                >
                  <i className={clsxm(action.icon, 'text-xl text-white')} />
                </GlassButton>
              </m.div>
            ))}

            <GlassButton onClick={() => setIsOpen(!isOpen)} className="relative z-10">
              <AnimatePresence initial={false} mode="wait">
                <m.i
                  key={isOpen ? 'close' : 'settings'}
                  className={clsxm(
                    'absolute text-2xl text-white',
                    isOpen ? 'i-mingcute-close-line' : 'i-mingcute-settings-3-line',
                  )}
                  initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                  transition={Spring.presets.snappy}
                />
              </AnimatePresence>
            </GlassButton>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
