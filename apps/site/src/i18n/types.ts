export type Locale = 'zh' | 'en'

interface TextItem {
  title: string
  body: string
}

export interface Translations {
  meta: {
    title: string
    description: string
  }
  nav: {
    login: string
    create: string
    lang: string
  }
  hero: {
    title: [string, string]
    subtitle: string
    newsLabel: string
    news: string
    shotAlt: string
  }
  statement: {
    lead: string
    rest: string
  }
  principles: [TextItem, TextItem, TextItem]
  wall: {
    title: [string, string]
    body: string
    shotAlt: string
    details: [TextItem, TextItem, TextItem, TextItem]
  }
  canvas: {
    title: [string, string]
    body: string
    shotAlt: string
  }
  discover: {
    title: string
    photos: string
    loading: string
    empty: string
    error: string
  }
  ways: {
    title: [string, string]
    body: string
    iphone: TextItem & { shotAlt: string }
    selfHost: TextItem & { copy: string, copied: string, copyLabel: string, guide: string }
  }
  open: {
    title: [string, string]
    button: string
    pending: string
    fine: string
  }
  createModal: {
    label: string
    title: string
    description: string
    inputLabel: string
    placeholder: string
    domainSuffix: string
    tipsTitle: string
    tips: string[]
    button: string
    buttonPending: string
    close: string
    validations: {
      required: string
      minLength: string
      invalid: string
    }
    errors: {
      generic: string
      network: string
      missingRedirect: string
    }
  }
  loginModal: {
    label: string
    title: string
    description: string
    inputLabel: string
    placeholder: string
    domainSuffix: string
    button: string
    close: string
    validations: {
      required: string
      minLength: string
      invalid: string
    }
  }
  footer: {
    terms: string
    privacy: string
    docs: string
    github: string
    selfHost: string
    appStore: string
  }
}
