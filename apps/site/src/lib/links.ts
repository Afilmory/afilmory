export const DOCS_URL = (import.meta.env.PUBLIC_DOCS_URL as string | undefined) ?? 'https://docs.afilmory.art'
export const GITHUB_URL
  = (import.meta.env.PUBLIC_GITHUB_URL as string | undefined) ?? 'https://github.com/Afilmory/Afilmory'
export const SELF_HOST_URL = `${GITHUB_URL}#option-2-self-hosting`
export const APP_STORE_URL = 'https://apps.apple.com/app/id6796660831'
export const DOCKER_COMMAND = 'docker run -d -p 3000:3000 afilmory/core'
