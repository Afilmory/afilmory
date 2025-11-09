import { clsxm, Spring } from '@afilmory/utils'
import { FluentEmoji, getEmoji } from '@lobehub/fluent-emoji'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { produce } from 'immer'
import { AnimatePresence, m } from 'motion/react'
import type { CSSProperties, RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { tv } from 'tailwind-variants'
import { useOnClickOutside } from 'usehooks-ts'

import { client } from '~/lib/client'

import { useAnalysis } from './hooks/useAnalysis'

const reactions = ['👍', '😍', '🔥', '👏', '🌟', '🙌'] as const

interface ReactionButtonProps {
  className?: string
  disabled?: boolean
  photoId: string
  style?: CSSProperties
}

const reactionButton = tv({
  slots: {
    base: 'relative **:data-radix-popper-content-wrapper:z-2',
    mainButton: [
      'relative z-2 flex size-10 items-center justify-center rounded-full',
      'border border-border/50 backdrop-blur-2xl',
      'transition-all duration-300',
      'active:scale-95',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'bg-background/95',
    ],
    mainButtonIcon: 'text-lg',
    reactionsContainer: [
      'relative mb-4 flex items-center justify-center gap-2',
      'rounded-full border border-accent/20 p-2 backdrop-blur-2xl',
      'select-none',
    ],
    reactionItem: ['relative flex size-10 items-center justify-center', 'cursor-pointer text-xl'],
  },
})

const emojiContainerVariants = {
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: Spring.presets.snappy,
  },
  closed: {
    opacity: 0,
    scale: 0.2,
    y: 50,
    transition: Spring.presets.snappy,
  },
}

const emojiVariants = {
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: Spring.presets.snappy,
  },
  closed: {
    opacity: 0,
    y: 10,
    scale: 0.8,
    transition: Spring.presets.snappy,
  },
}

const iconVariants = {
  open: { rotate: 180 },
  closed: { rotate: 0 },
}
export const ReactionButton = ({ className, disabled = false, photoId, style }: ReactionButtonProps) => {
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const styles = reactionButton()
  const { t } = useTranslation()

  const handleReaction = useCallback(
    async (reaction: (typeof reactions)[number]) => {
      await client.actReaction({
        refKey: photoId,
        reaction,
      })
      toast.success(t('photo.reaction.success'))
    },
    [photoId, t],
  )
  const { data, mutate } = useAnalysis(photoId)
  const handleReactionClick = useCallback(
    (reaction: (typeof reactions)[number]) => {
      handleReaction(reaction).then(() => {
        mutate((data) => {
          return produce(data, (draft) => {
            if (!draft) return
            draft.data.reactions[reaction] = (draft.data.reactions[reaction] || 0) + 1
          })
        })
      })
      setIsOpen(false)
    },
    [handleReaction, mutate],
  )

  useOnClickOutside({ current: panelElement } as RefObject<HTMLElement>, () => {
    setIsOpen(false)
  })

  const [currentAnimatingEmoji, setCurrentAnimatingEmoji] = useState<(typeof reactions)[number] | null>(null)

  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  return (
    <div className={clsxm(styles.base(), className)} style={style}>
      <DropdownMenu.Root open={isOpen}>
        <DropdownMenu.Trigger asChild>
          <m.button
            className={styles.mainButton()}
            disabled={disabled}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-expanded={isOpen}
            aria-label="React to photo"
            initial="closed"
            onClick={() => {
              setIsOpen((prev) => !prev)
            }}
            exit={{
              opacity: 0,
              scale: 0,
              transition: { duration: 0.2 },
            }}
            animate={isOpen ? 'open' : 'closed'}
          >
            <AnimatePresence>
              {currentAnimatingEmoji ? (
                <m.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, transition: { duration: 0.3 } }}
                  transition={Spring.presets.snappy}
                  onAnimationComplete={() => {
                    if (animationTimeoutRef.current) {
                      clearTimeout(animationTimeoutRef.current)
                    }
                    animationTimeoutRef.current = setTimeout(() => {
                      setCurrentAnimatingEmoji(null)
                    }, 1000)
                  }}
                >
                  <FluentEmoji cdn="aliyun" emoji={getEmoji(currentAnimatingEmoji)!} size={24} type="anim" />
                </m.span>
              ) : (
                <m.div variants={iconVariants}>
                  <AnimatePresence mode="popLayout">
                    <m.i
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      transition={Spring.presets.smooth}
                      key={isOpen ? 'close' : 'emoji'}
                      className={isOpen ? 'i-mingcute-close-fill' : 'i-mingcute-emoji-fill'}
                    />
                  </AnimatePresence>
                </m.div>
              )}
            </AnimatePresence>
          </m.button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content side="top" align="center" forceMount asChild>
          <AnimatePresence>
            {isOpen && (
              <m.div
                ref={setPanelElement}
                variants={emojiContainerVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className={styles.reactionsContainer()}
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
                  boxShadow:
                    '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                {reactions.map((reaction) => (
                  <DropdownMenu.Item key={reaction} asChild>
                    <m.button
                      className={styles.reactionItem()}
                      variants={emojiVariants}
                      onClick={() => {
                        if (animationTimeoutRef.current) {
                          clearTimeout(animationTimeoutRef.current)
                        }
                        setCurrentAnimatingEmoji(reaction)
                        handleReactionClick(reaction)
                      }}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <FluentEmoji cdn="aliyun" emoji={getEmoji(reaction)!} size={24} type="anim" />
                      {!!data?.data.reactions[reaction] && (
                        <span className="bg-red/50 absolute top-0 right-0 rounded-full px-1.5 py-0.5 text-[8px] text-white tabular-nums backdrop-blur-2xl">
                          {data.data.reactions[reaction]}
                        </span>
                      )}
                    </m.button>
                  </DropdownMenu.Item>
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  )
}
