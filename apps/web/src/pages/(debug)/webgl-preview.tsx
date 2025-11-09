import { Button } from '@afilmory/ui'
import { WebGLImageViewer } from '@afilmory/webgl-viewer'
import { useState } from 'react'

import { useBlobUrl } from '~/lib/blob-url-manager'

export const Component = () => {
  const [file, setFile] = useState<File | null>(null)
  const blobUrl = useBlobUrl(file) || '/test.jpg'

  return (
    <div className="relative flex h-svh w-full flex-col gap-4">
      <div>
        <Button
          className="shrink-0"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) {
                setFile(file)
              }
            }
            input.click()
          }}
        >
          Upload
        </Button>
      </div>
      {blobUrl && (
        <div className="relative grow">
          <WebGLImageViewer debug src={blobUrl} />
        </div>
      )}
    </div>
  )
}
