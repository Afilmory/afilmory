export type UiFieldComponentType = 'text' | 'secret' | 'textarea' | 'select' | 'slot' | 'switch'

interface UiFieldComponentBase<Type extends UiFieldComponentType> {
  readonly type: Type
}

export interface UiTextInputComponent extends UiFieldComponentBase<'text'> {
  readonly inputType?: 'text' | 'email' | 'url' | 'number'
  readonly placeholder?: string
  readonly autoComplete?: string
}

export interface UiSecretInputComponent extends UiFieldComponentBase<'secret'> {
  readonly placeholder?: string
  readonly autoComplete?: string
  readonly revealable?: boolean
}

export interface UiTextareaComponent extends UiFieldComponentBase<'textarea'> {
  readonly placeholder?: string
  readonly minRows?: number
  readonly maxRows?: number
}

export interface UiSelectComponent extends UiFieldComponentBase<'select'> {
  readonly placeholder?: string
  readonly options?: readonly string[]
  readonly allowCustom?: boolean
}

export interface UiSwitchComponent extends UiFieldComponentBase<'switch'> {
  readonly trueLabel?: string
  readonly falseLabel?: string
}

export interface UiSlotComponent<Key extends string = string> extends UiFieldComponentBase<'slot'> {
  readonly name: string
  readonly fields?: ReadonlyArray<{ key: Key; label?: string; required?: boolean }>
  readonly props?: Readonly<Record<string, unknown>>
}

export type UiFieldComponentDefinition<Key extends string = string> =
  | UiTextInputComponent
  | UiSecretInputComponent
  | UiTextareaComponent
  | UiSelectComponent
  | UiSwitchComponent
  | UiSlotComponent<Key>

interface BaseUiNode {
  readonly id: string
  readonly title: string
  readonly description?: string | null
}

export interface UiFieldNode<Key extends string = string> extends BaseUiNode {
  readonly type: 'field'
  readonly key: Key
  readonly component: UiFieldComponentDefinition<Key>
  readonly helperText?: string | null
  readonly docUrl?: string | null
  readonly isSensitive?: boolean
  readonly required?: boolean
  readonly icon?: string
  readonly hidden?: boolean
}

export interface UiGroupNode<Key extends string = string> extends BaseUiNode {
  readonly type: 'group'
  readonly icon?: string
  readonly children: ReadonlyArray<UiNode<Key>>
}

export interface UiSectionNode<Key extends string = string> extends BaseUiNode {
  readonly type: 'section'
  readonly icon?: string
  readonly layout?: {
    readonly columns?: number
  }
  readonly children: ReadonlyArray<UiNode<Key>>
}

export type UiNode<Key extends string = string> = UiSectionNode<Key> | UiGroupNode<Key> | UiFieldNode<Key>

export interface UiSchema<Key extends string = string> {
  readonly version: string
  readonly title: string
  readonly description?: string | null
  readonly sections: ReadonlyArray<UiSectionNode<Key>>
}

export interface UiSchemaResponse<Key extends string = string, Value = string | null> {
  readonly schema: UiSchema<Key>
  readonly values?: Partial<Record<Key, Value>>
}
