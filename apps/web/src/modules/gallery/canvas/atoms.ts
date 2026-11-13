import type { Arrangement } from '@afilmory/photo-canvas'
import { atom } from 'jotai'

export const canvasArrangeAtom = atom<Arrangement>('wall')
