import type { Atom, PrimitiveAtom } from 'jotai'
import { createStore, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { useMemo } from 'react'

export const jotaiStore = createStore()

export function createAtomAccessor<T>(atom: PrimitiveAtom<T>) {
  return [() => jotaiStore.get(atom), (value: T) => jotaiStore.set(atom, value)] as const
}

const options = { store: jotaiStore }
/**
 * @param atom - jotai
 * @returns - [atom, useAtom, useAtomValue, useSetAtom, jotaiStore.get, jotaiStore.set]
 */
export function createAtomHooks<T>(atom: PrimitiveAtom<T>) {
  return [
    atom,
    () => useAtom(atom, options),
    () => useAtomValue(atom, options),
    () => useSetAtom(atom, options),
    ...createAtomAccessor(atom),
  ] as const
}

export function createAtomSelector<T>(atom: Atom<T>) {
  const useHook = <R>(selector: (a: T) => R) => {
    const memoizedAtom = useMemo(() => selectAtom(atom, (value) => selector(value)), [selector])

    return useAtomValue(memoizedAtom)
  }

  useHook.__atom = atom
  return useHook
}
