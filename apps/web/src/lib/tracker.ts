import { injectConfig } from '~/config'
import { client } from '~/lib/client'

export const trackView = (photoId: string) => {
  if (!injectConfig.useApi) return
  client.actView({
    refKey: photoId,
  })
}
