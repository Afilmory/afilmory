import type { Arrangement, AttractBasis } from '@afilmory/photo-canvas'
import { atom } from 'jotai'

export const canvasArrangeAtom = atom<Arrangement>('wall')
export const canvasAttractBasisAtom = atom<AttractBasis>('color')
