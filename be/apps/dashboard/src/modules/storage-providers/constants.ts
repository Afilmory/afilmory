export const STORAGE_SETTING_KEYS = {
  providers: 'builder.storage.providers',
  activeProvider: 'builder.storage.activeProvider',
} as const satisfies {
  providers: string
  activeProvider: string
}

export const MANAGED_STORAGE_ACTIVE_ID = 'managed'

export const storageProvidersI18nKeys = {
  blocker: {
    title: 'storage.providers.blocker.title',
    description: 'storage.providers.blocker.description',
    confirm: 'storage.providers.blocker.confirm',
    cancel: 'storage.providers.blocker.cancel',
  },
  actions: {
    add: 'storage.providers.actions.add',
    save: 'storage.providers.actions.save',
    saving: 'storage.providers.actions.saving',
    cancel: 'storage.providers.actions.cancel',
    create: 'storage.providers.actions.create',
  },
  prompt: {
    title: 'storage.providers.prompt.sync.title',
    description: 'storage.providers.prompt.sync.description',
    confirm: 'storage.providers.prompt.sync.confirm',
    cancel: 'storage.providers.prompt.sync.cancel',
  },
  status: {
    error: 'storage.providers.status.error',
    saved: 'storage.providers.status.saved',
    dirty: 'storage.providers.status.dirty',
    summary: 'storage.providers.status.summary',
  },
  empty: {
    title: 'storage.providers.empty.title',
    description: 'storage.providers.empty.description',
    action: 'storage.providers.empty.action',
  },
  errors: {
    load: 'storage.providers.error.load',
  },
  security: {
    title: 'storage.providers.security.title',
    description: 'storage.providers.security.description',
    helper: 'storage.providers.security.helper',
  },
  modal: {
    createTitle: 'storage.providers.modal.create.title',
    editTitle: 'storage.providers.modal.edit.title',
    createDescription: 'storage.providers.modal.create.description',
    editDescription: 'storage.providers.modal.edit.description',
    sections: {
      basic: 'storage.providers.modal.sections.basic',
      connection: 'storage.providers.modal.sections.connection',
    },
    fields: {
      nameLabel: 'storage.providers.modal.fields.name.label',
      namePlaceholder: 'storage.providers.modal.fields.name.placeholder',
      typeLabel: 'storage.providers.modal.fields.type.label',
      typePlaceholder: 'storage.providers.modal.fields.type.placeholder',
      required: 'storage.providers.modal.fields.required',
    },
  },
  card: {
    active: 'storage.providers.card.active',
    makeActive: 'storage.providers.card.make-active',
    makeInactive: 'storage.providers.card.make-inactive',
    edit: 'storage.providers.card.edit',
    notConfigured: 'storage.providers.card.preview.not-configured',
    fallback: 'storage.providers.card.preview.fallback',
    untitled: 'storage.providers.card.untitled',
  },
  types: {
    s3: 'storage.providers.types.s3',
    github: 'storage.providers.types.github',
    b2: 'storage.providers.types.b2',
    local: 'storage.providers.types.local',
    minio: 'storage.providers.types.minio',
    eagle: 'storage.providers.types.eagle',
  },
} as const satisfies {
  blocker: {
    title: I18nKeys
    description: I18nKeys
    confirm: I18nKeys
    cancel: I18nKeys
  }
  actions: {
    add: I18nKeys
    save: I18nKeys
    saving: I18nKeys
    cancel: I18nKeys
    create: I18nKeys
  }
  prompt: {
    title: I18nKeys
    description: I18nKeys
    confirm: I18nKeys
    cancel: I18nKeys
  }
  status: {
    error: I18nKeys
    saved: I18nKeys
    dirty: I18nKeys
    summary: I18nKeys
  }
  empty: {
    title: I18nKeys
    description: I18nKeys
    action: I18nKeys
  }
  errors: {
    load: I18nKeys
  }
  security: {
    title: I18nKeys
    description: I18nKeys
    helper: I18nKeys
  }
  modal: {
    createTitle: I18nKeys
    editTitle: I18nKeys
    createDescription: I18nKeys
    editDescription: I18nKeys
    sections: {
      basic: I18nKeys
      connection: I18nKeys
    }
    fields: {
      nameLabel: I18nKeys
      namePlaceholder: I18nKeys
      typeLabel: I18nKeys
      typePlaceholder: I18nKeys
      required: I18nKeys
    }
  }
  card: {
    active: I18nKeys
    makeActive: I18nKeys
    makeInactive: I18nKeys
    edit: I18nKeys
    notConfigured: I18nKeys
    fallback: I18nKeys
    untitled: I18nKeys
  }
  types: {
    s3: I18nKeys
    github: I18nKeys
    b2: I18nKeys
    local: I18nKeys
    minio: I18nKeys
    eagle: I18nKeys
  }
}
