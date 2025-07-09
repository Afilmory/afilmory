import siteConfig from '@config'
import { Outlet } from 'react-router'

export const Component = () => {
  return (
    <>
      {siteConfig.accentColor && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
          :root:has(input.theme-controller[value=dark]:checked), [data-theme="dark"] {
            --color-primary: ${siteConfig.accentColor};
            --color-accent: ${siteConfig.accentColor};
            --color-secondary: ${siteConfig.accentColor};
          }
          `,
          }}
        />
      )}
      <Outlet />
    </>
  )
}
