import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { AutoComplete, Button, ColorPicker, Input, InputNumber, Popconfirm, Select, Switch, Tooltip } from 'antd';
import { DOMAIN_LABELS, type Domain, type ResolvedConcept, type ValidationIssue } from '@sprout/schema';
import ConceptSelect from './ConceptSelect';
import MediaField from './MediaField';
import {
  asSchema, branchForValue, defaultForSchema, ENUM_LABELS, fieldLabel, fieldWidget, isConceptUnion,
  isRecord, issueMessage, issuesAt, reorder, resolveSchema, schemaBranches, schemaFields, schemaKind, type JsonSchema,
} from './schema';
import { CATEGORY_LABELS } from './model';

export interface SchemaFormContext {
  concepts?: ResolvedConcept[];
  issues?: ValidationIssue[];
  disabled?: boolean;
  readOnlyPaths?: string[];
  activityType?: string;
  packId?: string;
  optionsByPath?: Record<string, { value: string; label: string }[]>;
  onUploading?: (path: string, uploading: boolean) => void;
  onInvalidJson?: (path: string, message?: string) => void;
}

export interface SchemaFieldProps extends SchemaFormContext {
  schema: JsonSchema;
  root?: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  label?: string;
  required?: boolean;
  conceptReference?: boolean;
}

function enumLabel(value: unknown, path: string): string {
  const text = String(value);
  if (path.endsWith('domains') && text in DOMAIN_LABELS) return DOMAIN_LABELS[text as Domain].zh;
  if (path.endsWith('category') && text in CATEGORY_LABELS) return CATEGORY_LABELS[text as keyof typeof CATEGORY_LABELS];
  return ENUM_LABELS[text] ?? text;
}

export function SchemaObject({ schema, root = schema, value, onChange, path = '', only, ...context }: Omit<SchemaFieldProps, 'path'> & {
  path?: string;
  only?: string[];
}) {
  const object = isRecord(value) ? value : {};
  const fields = schemaFields(schema, root).filter((field) => !only || only.includes(field.key));
  const extras = Object.fromEntries(Object.entries(object).filter(([key]) =>
    !schemaFields(schema, root).some((field) => field.key === key)));
  const resolved = resolveSchema(schema, root);
  const patch = (key: string, next: unknown) => {
    const updated = { ...object };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };
  return (
    <div className="content-schema-object">
      {fields.map((field) => (
        <SchemaField key={field.key} {...context} schema={field.schema} root={root}
          path={[path, field.key].filter(Boolean).join('.')}
          label={fieldLabel(field.key, field.schema)} required={field.required}
          value={object[field.key]} onChange={(next) => patch(field.key, next)} />
      ))}
      {(resolved.additionalProperties !== false && (Object.hasOwn(resolved, 'additionalProperties') || Object.keys(extras).length > 0 || !schemaFields(schema, root).length)) && (
        <SchemaField {...context} schema={{}} path={path ? `${path}.$extra` : '$extra'} label="其他参数"
          value={extras} onChange={(next) => {
            if (isRecord(next)) onChange({ ...Object.fromEntries(Object.entries(object).filter(([key]) => !Object.hasOwn(extras, key))), ...next });
          }} />
      )}
    </div>
  );
}

function RawJsonField({ value, onChange, path, label, disabled, id, onInvalidJson }: {
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  label: string;
  disabled?: boolean;
  id: string;
  onInvalidJson?: SchemaFormContext['onInvalidJson'];
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');
  const emitted = useRef(value);
  const callback = useRef(onInvalidJson);
  callback.current = onInvalidJson;
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setRaw(JSON.stringify(value ?? {}, null, 2));
      setError('');
      callback.current?.(path);
    }
  }, [value, path]);
  useEffect(() => () => callback.current?.(path), [path]);
  return (
    <>
      <Input.TextArea id={id} aria-label={label} className="content-json" value={raw} autoSize={{ minRows: 4, maxRows: 16 }}
        status={error ? 'error' : undefined} disabled={disabled} spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          setRaw(next);
          try {
            const parsed: unknown = JSON.parse(next);
            emitted.current = parsed;
            setError('');
            onInvalidJson?.(path);
            onChange(parsed);
          } catch {
            const message = 'JSON 格式错误，请检查引号、逗号和括号';
            setError(message);
            onInvalidJson?.(path, message);
          }
        }} />
      {error && <span className="content-field-error" role="alert">{error}</span>}
    </>
  );
}

export function SchemaField(props: SchemaFieldProps) {
  const {
    schema: input, root = input, value, onChange, path, label: explicitLabel, required = false,
    concepts = [], issues = [], readOnlyPaths = [], activityType, optionsByPath, packId,
    onUploading, onInvalidJson, conceptReference,
  } = props;
  const schema = resolveSchema(input, root);
  const key = path.split('.').at(-1) ?? path;
  const label = explicitLabel ?? fieldLabel(key, schema);
  const id = useId();
  const kind = schemaKind(schema, root);
  const disabled = props.disabled || readOnlyPaths.includes(path) || schema.readOnly === true;
  const ownIssues = issuesAt(issues, path);
  const invalid = ownIssues.some((issue) => issue.level === 'error');
  const context: SchemaFormContext = { disabled, concepts, issues, readOnlyPaths, activityType, packId, optionsByPath, onUploading, onInvalidJson };
  const branches = schemaBranches(schema, root);
  const optionalContainer = !required && (kind === 'object' || kind === 'array' || kind === 'union' || kind === 'json' || kind === 'boolean');
  const isAbsent = value === undefined;
  let control: ReactNode;

  if (optionalContainer && isAbsent) {
    control = <Button id={id} type="dashed" icon={<PlusOutlined />} disabled={disabled}
      onClick={() => onChange(defaultForSchema(schema, root))}>添加{label}</Button>;
  } else if (kind === 'union') {
    const index = branchForValue(branches, value, root);
    const isConcept = isConceptUnion(schema, root) || fieldWidget(schema, path, activityType) === 'concept';
    const branchOptions = branches.map((branch, branchIndex) => {
      const branchKind = schemaKind(branch, root);
      const names: Record<string, string> = {
        string: isConcept ? '词库词条' : '文字', object: isConcept ? '自定义词条' : '自定义对象',
        number: '数值', boolean: '开关', array: '列表', null: path.endsWith('autoAdvanceSec') ? '手动翻页' : '空值（null）',
      };
      return { value: branchIndex, label: typeof branch.title === 'string' ? branch.title : names[branchKind] ?? `类型 ${branchIndex + 1}` };
    });
    control = (
      <div className="content-union">
        <Select id={id} aria-label={`${label}类型`} value={index} options={branchOptions} disabled={disabled}
          onChange={(next) => onChange(defaultForSchema(branches[next], root))} />
        {schemaKind(branches[index], root) !== 'null' && (
          <SchemaField {...context} schema={branches[index]} root={root} value={value} onChange={onChange}
            path={path} label={label} required conceptReference={isConcept} />
        )}
      </div>
    );
  } else if (kind === 'object') {
    control = <SchemaObject {...context} schema={schema} root={root} path={path} value={value} onChange={onChange} />;
  } else if (kind === 'array') {
    const items = Array.isArray(value) ? value : [];
    const tuple = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined;
    const itemSchema = resolveSchema(asSchema(schema.items), root);
    const minimum = typeof schema.minItems === 'number' ? schema.minItems : 0;
    const maximum = typeof schema.maxItems === 'number' ? schema.maxItems : undefined;
    if (!tuple && Array.isArray(itemSchema.enum)) {
      control = (
        <Select id={id} aria-label={label} mode="multiple" className="content-full-width" disabled={disabled}
          value={items} maxCount={maximum} status={invalid ? 'error' : undefined}
          options={itemSchema.enum.map((item) => ({ value: item as string, label: enumLabel(item, path) }))}
          onChange={onChange} />
      );
    } else {
      control = (
        <div className={tuple ? 'content-tuple' : 'content-array'}>
          {items.map((item, index) => (
            <div key={index} className="content-array-row">
              <SchemaField {...context} schema={tuple ? asSchema(tuple[index]) : itemSchema} root={root}
                value={item} required path={`${path}.${index}`}
                label={tuple && key === 'ageRange' ? (index === 0 ? '最小月龄（月）' : '最大月龄（月）') : `${label} ${index + 1}`}
                onChange={(next) => onChange(items.map((old, i) => i === index ? next : old))} />
              {!tuple && !disabled && (
                <div className="content-array-actions">
                  <Tooltip title="上移"><Button aria-label={`${label} ${index + 1} 上移`} icon={<ArrowUpOutlined />} size="small"
                    disabled={index === 0} onClick={() => onChange(reorder(items, index, index - 1))} /></Tooltip>
                  <Tooltip title="下移"><Button aria-label={`${label} ${index + 1} 下移`} icon={<ArrowDownOutlined />} size="small"
                    disabled={index === items.length - 1} onClick={() => onChange(reorder(items, index, index + 1))} /></Tooltip>
                  <Popconfirm title={`删除这项${label}？`} okText="删除" cancelText="保留"
                    onConfirm={() => onChange(items.filter((_, i) => i !== index))} disabled={items.length <= minimum}>
                    <Tooltip title="删除"><Button aria-label={`${label} ${index + 1} 删除`} icon={<DeleteOutlined />} size="small"
                      danger disabled={items.length <= minimum} /></Tooltip>
                  </Popconfirm>
                </div>
              )}
            </div>
          ))}
          {!tuple && !disabled && (
            <Button icon={<PlusOutlined />} type="dashed" disabled={maximum !== undefined && items.length >= maximum}
              onClick={() => onChange([...items, defaultForSchema(itemSchema, root)])}>添加{label}</Button>
          )}
          {maximum !== undefined && !tuple && <small className="muted">{items.length} / {maximum} 项</small>}
        </div>
      );
    }
  } else if (kind === 'enum') {
    const values = Array.isArray(schema.enum) ? schema.enum : [schema.const];
    control = (
      <Select id={id} aria-label={label} className="content-full-width" value={value === undefined ? undefined : JSON.stringify(value)}
        disabled={disabled || Object.hasOwn(schema, 'const')} allowClear={!required}
        status={invalid ? 'error' : undefined}
        options={values.map((item) => ({ value: JSON.stringify(item), label: enumLabel(item, path) }))}
        onChange={(next) => onChange(next === undefined ? undefined : JSON.parse(next))} />
    );
  } else if (kind === 'boolean') {
    control = <Switch id={id} aria-label={label} checked={value === true} disabled={disabled} onChange={onChange} checkedChildren="开" unCheckedChildren="关" />;
  } else if (kind === 'number') {
    control = (
      <InputNumber id={id} aria-label={label} className="content-full-width" disabled={disabled}
        value={typeof value === 'number' ? value : null} status={invalid ? 'error' : undefined}
        min={typeof schema.minimum === 'number' ? schema.minimum : undefined}
        max={typeof schema.maximum === 'number' ? schema.maximum : undefined}
        precision={schema.type === 'integer' ? 0 : undefined}
        step={typeof schema.multipleOf === 'number' ? schema.multipleOf : schema.type === 'integer' ? 1 : 0.5}
        onChange={(next) => onChange(next === null ? undefined : next)} />
    );
  } else if (kind === 'null') {
    control = <span>空值（null）</span>;
  } else if (kind === 'string') {
    const text = typeof value === 'string' ? value : '';
    const widget = conceptReference ? 'concept' : fieldWidget(schema, path, activityType);
    const update = (next: string | undefined) => onChange(!next && !required ? undefined : next ?? '');
    if (widget === 'concept') {
      control = <ConceptSelect id={id} label={label} value={text} onChange={update} concepts={concepts}
        disabled={disabled} packId={packId} invalid={invalid} />;
    } else if (widget === 'image' || widget === 'media') {
      control = <MediaField id={id} label={label} value={text} onChange={update} disabled={disabled}
        media={widget === 'media'} packId={packId} onUploading={(busy) => onUploading?.(path, busy)} />;
    } else if (widget === 'color') {
      control = (
        <div className="content-inline">
          <ColorPicker disabled={disabled} value={/^#[a-f0-9]{3,8}$/i.test(text) ? text : undefined}
            onChangeComplete={(color) => update(color.toHexString())} />
          <Input id={id} aria-label={label} value={text} onChange={(event) => update(event.target.value)} disabled={disabled} />
        </div>
      );
    } else if (optionsByPath?.[path]) {
      control = <AutoComplete id={id} aria-label={label} className="content-full-width" value={text} disabled={disabled}
        options={optionsByPath[path]} onChange={update}
        filterOption={(search, option) => `${option?.label ?? ''} ${option?.value ?? ''}`.toLowerCase().includes(search.toLowerCase())} />;
    } else {
      const multiline = ['intro', 'why', 'safety', 'parentTip', 'notes'].includes(key) || /(?:tips|materials|steps)\.\d+$/.test(path);
      const shared = {
        id, 'aria-label': label, 'aria-invalid': invalid || undefined, value: text, disabled,
        status: invalid ? 'error' as const : undefined,
        maxLength: typeof schema.maxLength === 'number' ? schema.maxLength : undefined,
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(event.target.value),
      };
      control = multiline ? <Input.TextArea {...shared} autoSize={{ minRows: 2, maxRows: 6 }} showCount={!!schema.maxLength} /> : <Input {...shared} />;
    }
  } else {
    control = <RawJsonField id={id} label={label} path={path} value={value} onChange={onChange} disabled={disabled} onInvalidJson={onInvalidJson} />;
  }

  return (
    <div className={`content-field content-field-${kind}${invalid ? ' content-field-invalid' : ''}`} data-content-path={path} tabIndex={-1}>
      <div className="content-field-heading">
        <label htmlFor={id}>{label}{required && <span className="content-required" aria-label="必填"> *</span>}</label>
        {optionalContainer && !isAbsent && !disabled && (
          <Popconfirm title={`移除${label}？`} okText="移除" cancelText="保留" onConfirm={() => onChange(undefined)}>
            <Tooltip title={`移除${label}`}><Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`移除${label}`} /></Tooltip>
          </Popconfirm>
        )}
      </div>
      {control}
      {typeof schema.description === 'string' && <small className="muted">{schema.description}</small>}
      {ownIssues.map((issue, index) => <span key={index} role={issue.level === 'error' ? 'alert' : undefined}
        className={issue.level === 'error' ? 'content-field-error' : 'content-field-warning'}>{issueMessage(issue.message)}</span>)}
    </div>
  );
}
