import { SymbolView } from 'expo-symbols'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScreenStack, ScreenStackItem } from 'react-native-screens'

import { useTranslation } from '@/i18n'
import { font, radiusLg } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

import type { PageRuntime } from './page'
import { PageRuntimeProvider } from './page'
import type { PresentationSession } from './presentationStore'
import {
  cancelPresentation,
  completePresentation,
  finalizePresentation,
  getPresentationSnapshot,
  present,
  subscribeToPresentations,
} from './presentationStore'

const ignoreRequestClose = () => {}
const MODAL_DISMISS_FALLBACK_MS = 1000

export function PresentationHost() {
  const sessions = useSyncExternalStore(subscribeToPresentations, getPresentationSnapshot, getPresentationSnapshot)

  return sessions.map(session =>
    session.presentation.detents ? (
      <PresentationSheet key={session.id} session={session} />
    ) : (
      <PresentationModal key={session.id} session={session} />
    ))
}

function useSessionRuntime(session: PresentationSession) {
  const cancel = useCallback(() => cancelPresentation(session.id), [session.id])
  const finish = useCallback((value?: unknown) => completePresentation(session.id, value), [session.id])
  const runtime = useMemo<PageRuntime<unknown, unknown>>(
    () => ({ cancel, finish, params: session.params, present, source: 'presentation' }),
    [cancel, finish, session.params],
  )
  return { cancel, runtime }
}

function PresentationModal({ session }: { session: PresentationSession }) {
  const { palette } = useTheme()
  const { animationType, dismissible, style } = session.presentation
  const { cancel, runtime } = useSessionRuntime(session)
  const finalize = useCallback(() => finalizePresentation(session.id), [session.id])

  useEffect(() => {
    if (session.visible) {
      return
    }
    const timer = setTimeout(finalize, MODAL_DISMISS_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [finalize, session.visible])

  return (
    <Modal
      visible={session.visible}
      allowSwipeDismissal={dismissible}
      animationType={animationType}
      backdropColor={palette.bgCanvas}
      presentationStyle={style}
      onDismiss={finalize}
      onRequestClose={dismissible ? cancel : ignoreRequestClose}
    >
      <PageRuntimeProvider value={runtime}>
        <SessionBody backgroundColor={palette.bgCanvas} cancel={cancel} session={session} />
      </PageRuntimeProvider>
    </Modal>
  )
}

function PresentationSheet({ session }: { session: PresentationSession }) {
  const { palette } = useTheme()
  const { detents, dismissible } = session.presentation
  const { cancel, runtime } = useSessionRuntime(session)
  const onDismissed = useCallback(() => {
    if (dismissible) {
      cancel()
    }
  }, [cancel, dismissible])

  return (
    <ScreenStack pointerEvents="box-none" style={styles.sheetStack}>
      {/* react-native-screens always treats the first ScreenStackItem in a stack as the
          base "push" screen — only later siblings get natively presented as modals — so
          a formSheet needs an empty screen underneath it to present over. It has to be
          transparent and full-size: a zero-sized stack presents nothing at all, and an
          opaque host would hide the gallery the sheet is meant to filter live. */}
      <ScreenStackItem contentStyle={styles.transparent} screenId={`sheet-host-${session.id}`} />
      <ScreenStackItem
        contentStyle={{ backgroundColor: palette.bgSurface }}
        headerConfig={{ hidden: true }}
        preventNativeDismiss={!dismissible}
        screenId={`sheet-${session.id}`}
        sheetAllowedDetents={detents}
        sheetCornerRadius={radiusLg}
        sheetGrabberVisible={dismissible}
        stackPresentation="formSheet"
        onDismissed={onDismissed}
      >
        <PageRuntimeProvider value={runtime}>
          {/* Sheets without our own header mount the page directly: react-native-screens
              looks for a scroll view immediately inside the screen to size it against the
              detent, and intermediate wrapper views leave that scroll view unsized. */}
          {session.presentation.headerShown ? (
            <SessionBody backgroundColor={palette.bgSurface} cancel={cancel} session={session} />
          ) : (
            <session.page.Component />
          )}
        </PageRuntimeProvider>
      </ScreenStackItem>
    </ScreenStack>
  )
}

function SessionBody({
  backgroundColor,
  cancel,
  session,
}: {
  backgroundColor: string
  cancel: () => void
  session: PresentationSession
}) {
  const { palette } = useTheme()
  const { t } = useTranslation()
  const { Component } = session.page
  const { dismissible, headerShown } = session.presentation

  return (
    <View style={[styles.modal, { backgroundColor }]}>
      {headerShown ? (
        <View style={[styles.headerSurface, { backgroundColor: palette.bgSurface, borderBottomColor: palette.border }]}>
          <SafeAreaView edges={['top']}>
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text numberOfLines={1} style={[styles.title, { color: palette.textPrimary }]}>
                {session.page.title}
              </Text>
              <View style={[styles.headerSide, styles.headerAction]}>
                {dismissible ? (
                  <Pressable
                    accessibilityLabel={t('accessibility.closePage', { title: session.page.title })}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                    onPress={cancel}
                  >
                    <SymbolView name="xmark" size={16} tintColor={palette.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </SafeAreaView>
        </View>
      ) : null}
      <View style={styles.content}>
        <Component />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  content: { flex: 1 },
  // A zero-sized stack presents nothing at all, but a full-bleed one covers the window and
  // UIKit stops sampling the backdrop of every glass surface underneath, blanking the home
  // chrome while the sheet is up. One point is enough to anchor the presentation.
  sheetStack: {
    height: 1,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  transparent: { backgroundColor: 'transparent' },
  headerSurface: { borderBottomWidth: StyleSheet.hairlineWidth },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headerSide: { width: 44 },
  headerAction: { alignItems: 'flex-end' },
  title: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: { opacity: 0.5 },
})
