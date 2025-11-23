import { MDXProvider } from '@mdx-js/react'
import type { Element, MDXComponents } from 'mdx/types'

import { useNavigation } from '../contexts/NavigationContext'
import { routes } from '../routes'

// 判断是否是站内链接
function isInternalLink(href: string | undefined): boolean {
  if (!href) return false

  // 纯锚点链接（以 # 开头），使用浏览器默认行为，不拦截
  if (href.startsWith('#')) {
    return false
  }

  // 排除协议链接（http, https, mailto, tel, javascript 等）
  const protocolPattern = /^(?:https?:|mailto:|tel:|javascript:)/i
  if (protocolPattern.test(href)) {
    return false
  }

  // 提取路径部分（移除锚点和查询参数）
  const pathOnly = href.split('#')[0].split('?')[0]

  // 如果是相对路径（以 / 开头），检查是否在路由中
  if (pathOnly.startsWith('/')) {
    // 移除末尾的斜杠（除了根路径）
    const normalizedHref = pathOnly === '/' ? '/' : pathOnly.replace(/\/$/, '')
    return routes.some((route) => {
      const normalizedRoutePath = route.path === '/' ? '/' : route.path.replace(/\/$/, '')
      return normalizedRoutePath === normalizedHref
    })
  }

  // 如果是相对路径（不以 / 开头），也认为是站内链接
  // 但需要检查是否包含协议
  if (!pathOnly.includes('://')) {
    return true
  }

  return false
}

// 自定义链接组件
function CustomLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useNavigation()

  if (isInternalLink(href)) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault()
          if (href) {
            // 提取路径部分（移除锚点和查询参数），只导航到路径
            const pathOnly = href.split('#')[0].split('?')[0]
            navigate(pathOnly)
            // 如果有锚点，让浏览器处理滚动
            if (href.includes('#')) {
              const hash = href.split('#')[1]
              if (hash) {
                // 使用 setTimeout 确保导航完成后再滚动
                setTimeout(() => {
                  const element = document.querySelector(`#${hash}`)
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' })
                  }
                }, 0)
              }
            }
          }
        }}
        {...props}
      >
        {children}
      </a>
    )
  }

  // 外部链接，使用普通 <a> 标签
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

const components: MDXComponents = {
  a: CustomLink,
}

export function MDX({ content }: { content: Element }) {
  return <MDXProvider components={components}>{content}</MDXProvider>
}
