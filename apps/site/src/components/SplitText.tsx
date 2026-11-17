import type { CSSProperties } from 'react'

export function SplitText({ text, offset = 0 }: { text: string, offset?: number }) {
  return (
    <>
      {Array.from(text).map((char, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key -- characters repeat; position is the identity
          key={index}
          className="lp-char"
          style={{ '--i': offset + index } as CSSProperties}
        >
          {char}
        </span>
      ))}
    </>
  )
}
