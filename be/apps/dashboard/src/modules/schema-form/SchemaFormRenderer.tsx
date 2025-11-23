import {
  Button,
  FormHelperText,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { ReactNode } from 'react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '../../components/common/LinearBorderPanel'
import type {
  SchemaFormState,
  SchemaFormValue,
  UiFieldComponentDefinition,
  UiFieldNode,
  UiGroupNode,
  UiNode,
  UiSchema,
  UiSlotComponent,
} from './types'

function FieldDescription({ description }: { description?: string | null }) {
  if (!description) {
    return null
  }

  return <p className="text-text-tertiary mt-1 text-xs">{description}</p>
}

function SchemaIcon({ name, className }: { name?: string | null; className?: string }) {
  if (!name) {
    return null
  }

  return <DynamicIcon name={name as any} className={clsxm('h-4 w-4', className)} />
}

function SecretFieldInput<Key extends string>({
  component,
  fieldKey,
  value,
  onChange,
}: {
  component: Extract<UiFieldComponentDefinition<Key>, { type: 'secret' }>
  fieldKey: Key
  value: string
  onChange: (key: Key, value: SchemaFormValue) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        type={revealed ? 'text' : 'password'}
        value={value}
        onInput={(event) => onChange(fieldKey, event.currentTarget.value)}
        placeholder={component.placeholder ?? ''}
        autoComplete={component.autoComplete}
        className="border-fill-tertiary/50 bg-background flex-1 focus:border-accent/40"
      />
      {component.revealable ? (
        <Button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          variant="ghost"
          size="sm"
          className="border-fill-tertiary/50 text-text-secondary hover:bg-fill/30 hover:text-text border"
        >
          {revealed ? t('schema-form.secret.hide') : t('schema-form.secret.show')}
        </Button>
      ) : null}
    </div>
  )
}

type SlotRenderer<Key extends string> = (
  field: UiFieldNode<Key> & { component: UiSlotComponent<Key> },
  context: SchemaRendererContext<Key>,
  onChange: (key: Key, value: SchemaFormValue) => void,
) => ReactNode

type FieldRendererProps<Key extends string> = {
  field: UiFieldNode<Key>
  value: SchemaFormValue | undefined
  onChange: (key: Key, value: SchemaFormValue) => void
  renderSlot?: SlotRenderer<Key>
  context: SchemaRendererContext<Key>
}

function FieldRenderer<Key extends string>({ field, value, onChange, renderSlot, context }: FieldRendererProps<Key>) {
  const { component } = field
  const { t } = useTranslation()

  if (component.type === 'slot') {
    return renderSlot
      ? renderSlot(field as UiFieldNode<Key> & { component: UiSlotComponent<Key> }, context, onChange)
      : null
  }

  if (component.type === 'textarea') {
    const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)
    return (
      <Textarea
        value={stringValue}
        onInput={(event) => onChange(field.key, event.currentTarget.value)}
        placeholder={component.placeholder ?? ''}
        rows={component.minRows ?? 3}
        className="border-fill-tertiary/50 bg-background focus:border-accent/40"
      />
    )
  }

  if (component.type === 'select') {
    const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)
    return (
      <Select value={stringValue} onValueChange={(nextValue) => onChange(field.key, nextValue)}>
        <SelectTrigger className="border-fill-tertiary/50 bg-background focus:border-accent/40">
          <SelectValue placeholder={component.placeholder ?? t('schema-form.select.placeholder')} />
        </SelectTrigger>
        <SelectContent className="border-fill-tertiary bg-background">
          {component.options?.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (component.type === 'secret') {
    const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)
    return <SecretFieldInput component={component} fieldKey={field.key} value={stringValue} onChange={onChange} />
  }

  if (component.type === 'switch') {
    const checked = Boolean(value)
    const label = checked ? component.trueLabel : component.falseLabel
    return (
      <div className="flex items-center gap-2">
        <Switch checked={checked} onCheckedChange={(next) => onChange(field.key, next)} />
        {label ? <span className="text-text-secondary text-xs">{label}</span> : null}
      </div>
    )
  }

  const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)
  const inputType = component.type === 'text' ? (component.inputType ?? 'text') : 'text'

  return (
    <Input
      type={inputType}
      value={stringValue}
      onInput={(event) => onChange(field.key, event.currentTarget.value)}
      placeholder={component.placeholder ?? ''}
      autoComplete={component.autoComplete}
      className="border-fill-tertiary/50 bg-background focus:border-accent/40"
    />
  )
}

function renderGroup<Key extends string>(
  node: UiGroupNode<Key>,
  context: SchemaRendererContext<Key>,
  formState: SchemaFormState<Key>,
  handleChange: (key: Key, value: SchemaFormValue) => void,
  shouldRenderNode?: SchemaFormRendererProps<Key>['shouldRenderNode'],
  renderSlot?: SlotRenderer<Key>,
) {
  const renderedChildren = node.children
    .map((child) => renderNode(child, context, formState, handleChange, shouldRenderNode, renderSlot))
    .filter(Boolean)

  if (renderedChildren.length === 0) {
    return null
  }

  return (
    <div key={node.id} className="bg-fill/5 relative rounded-lg p-5 transition-all duration-200">
      {/* Subtle borders for nested groups */}
      <div className="via-fill-tertiary/30 absolute top-0 right-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-fill-tertiary/30 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
      <div className="via-fill-tertiary/30 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-fill-tertiary/30 absolute top-0 bottom-0 left-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />

      <div className="flex items-center gap-2">
        <SchemaIcon name={node.icon} className="text-accent" />
        <h3 className="text-text text-sm font-semibold">{node.title}</h3>
      </div>
      <FieldDescription description={node.description} />

      <div className="mt-4 space-y-3">{renderedChildren}</div>
    </div>
  )
}

function FieldNode<Key extends string>({
  field,
  formState,
  handleChange,
  renderSlot,
  context,
}: {
  field: UiFieldNode<Key>
  formState: SchemaFormState<Key>
  handleChange: (key: Key, value: SchemaFormValue) => void
  renderSlot: SlotRenderer<Key> | undefined
  context: SchemaRendererContext<Key>
}) {
  const { t } = useTranslation()
  if (field.hidden) {
    return null
  }

  const value = formState[field.key]
  const { isSensitive, helperText, component, icon } = field

  if (component.type === 'switch') {
    const helper = helperText ? <FormHelperText>{helperText}</FormHelperText> : null

    return (
      <div key={field.id}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label className="text-text text-sm font-medium">{field.title}</Label>
            <FieldDescription description={field.description} />
          </div>
          <FieldRenderer
            field={field}
            value={value}
            onChange={handleChange}
            renderSlot={renderSlot}
            context={context}
          />
        </div>
        {helper}
      </div>
    )
  }

  const showSensitiveHint = isSensitive && typeof value === 'string' && value.length === 0

  return (
    <div key={field.id} className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-text text-sm font-medium">{field.title}</Label>
          <FieldDescription description={field.description} />
        </div>
        <SchemaIcon name={icon} className="text-text-tertiary" />
      </div>

      <FieldRenderer field={field} value={value} onChange={handleChange} renderSlot={renderSlot} context={context} />

      {showSensitiveHint ? <FormHelperText>{t('schema-form.secret.helper')}</FormHelperText> : null}

      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </div>
  )
}

function renderNode<Key extends string>(
  node: UiNode<Key>,
  context: SchemaRendererContext<Key>,
  formState: SchemaFormState<Key>,
  handleChange: (key: Key, value: SchemaFormValue) => void,
  shouldRenderNode?: SchemaFormRendererProps<Key>['shouldRenderNode'],
  renderSlot?: SlotRenderer<Key>,
): ReactNode {
  if (shouldRenderNode && !shouldRenderNode(node, context)) {
    return null
  }

  if (node.type === 'group') {
    return renderGroup(node, context, formState, handleChange, shouldRenderNode, renderSlot)
  }

  if (node.type === 'field') {
    return (
      <FieldNode
        field={node}
        formState={formState}
        handleChange={handleChange}
        renderSlot={renderSlot}
        context={context}
      />
    )
  }

  const renderedChildren = node.children
    .map((child) => renderNode(child, context, formState, handleChange, shouldRenderNode, renderSlot))
    .filter(Boolean)

  if (renderedChildren.length === 0) {
    return null
  }

  return (
    <Fragment key={node.id}>
      <div className="flex items-center gap-2">
        <SchemaIcon name={node.icon} className="text-accent h-5 w-5" />
        <h2 className="text-text text-base font-semibold">{node.title}</h2>
      </div>
      <FieldDescription description={node.description} />
      <div className="grid gap-4">{renderedChildren}</div>
    </Fragment>
  )
}

export interface SchemaRendererContext<Key extends string> {
  readonly values: SchemaFormState<Key>
}

export interface SchemaFormRendererProps<Key extends string> {
  schema: UiSchema<Key>
  values: SchemaFormState<Key>
  onChange: (key: Key, value: SchemaFormValue) => void
  shouldRenderNode?: (node: UiNode<Key>, context: SchemaRendererContext<Key>) => boolean
  renderSlot?: SlotRenderer<Key>
}

export function SchemaFormRendererUncontrolled<Key extends string>({
  initialValues,
  onChange,
  ...rest
}: Omit<SchemaFormRendererProps<Key>, 'values'> & { initialValues: SchemaFormState<Key> }) {
  const [values, setValues] = useState(initialValues)

  const handleChange = useMemo(
    () => (key: Key, value: SchemaFormValue) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value }
        onChange?.(key, value)
        return next
      })
    },
    [onChange],
  )

  return <SchemaFormRenderer {...rest} values={values} onChange={handleChange} />
}

export function SchemaFormRenderer<Key extends string>({
  schema,
  values,
  onChange,
  shouldRenderNode,
  renderSlot,
}: SchemaFormRendererProps<Key>) {
  const context: SchemaRendererContext<Key> = { values }

  return (
    <>
      {schema.sections.map((section) => {
        if (shouldRenderNode && !shouldRenderNode(section, context)) {
          return null
        }

        const renderedChildren = section.children
          .map((child) => renderNode(child, context, values, onChange, shouldRenderNode, renderSlot))
          .filter(Boolean)

        if (renderedChildren.length === 0) {
          return null
        }

        return (
          <LinearBorderPanel key={section.id} className="p-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <SchemaIcon name={section.icon} className="text-accent h-5 w-5" />
                  <h2 className="text-text text-lg font-semibold">{section.title}</h2>
                </div>
                <FieldDescription description={section.description} />
              </div>

              <div className="space-y-4">{renderedChildren}</div>
            </div>
          </LinearBorderPanel>
        )
      })}
    </>
  )
}
