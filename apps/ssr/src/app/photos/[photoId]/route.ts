export const GET =
  process.env.NODE_ENV === 'development'
    ? // @ts-expect-error
      (...rest) => import('./dev').then((m) => m.handler(...rest))
    : // @ts-expect-error
      (...rest) => import('./prod').then((m) => m.handler(...rest))
