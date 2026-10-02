import { ArrowDownOutlined, ArrowUpOutlined, CodeOutlined, CopyOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Segmented, Tag, Tooltip } from 'antd';
import { Input } from 'antd';
import type { ActivityStep } from '@sprout/schema';
import { CONTRACT_SCHEMAS, type ActivityChoice, type StepDraft } from './model';
import { asSchema, parsePropsJson } from './schema';
import { SchemaObject, type SchemaFormContext } from './SchemaForm';
import IssueList from './IssueList';

export default function StepEditor({
  draft, index, count, activity, onChange, onMove, onDelete, onCopy, onDragStart, onDrop, dragging, ...context
}: SchemaFormContext & {
  draft: StepDraft;
  index: number;
  count: number;
  activity?: ActivityChoice;
  onChange: (draft: StepDraft) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
  onCopy: () => void;
  onDragStart: (key: string) => void;
  onDrop: (key: string) => void;
  dragging?: boolean;
}) {
  const path = `steps.${index}`;
  const propsPath = `${path}.props`;
  const syntax = parsePropsJson(draft.json, propsPath);
  const metadataSchema = asSchema(asSchema(asSchema(CONTRACT_SCHEMAS.lesson.properties).steps).items);
  const propsIssues = (context.issues ?? []).filter((issue) => issue.path === propsPath || issue.path.startsWith(`${propsPath}.`));
  return (
    <section className={`content-step${dragging ? ' content-step-dragging' : ''}`} data-content-path={path} tabIndex={-1}
      onDragOver={(event) => { if (!context.disabled) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
      onDrop={(event) => { event.preventDefault(); if (!context.disabled) onDrop(draft.key); }}>
      <header className="content-step-header">
        <div className="content-step-heading" data-content-path={`${path}.type`} tabIndex={-1}>
          <Tooltip title="拖动调整顺序">
            <Button type="text" icon={<HolderOutlined />} aria-label={`拖动第 ${index + 1} 步`}
              disabled={context.disabled} draggable={!context.disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', draft.key);
                event.dataTransfer.effectAllowed = 'move';
                onDragStart(draft.key);
              }} />
          </Tooltip>
          <h3>{index + 1}. {activity?.name ?? draft.step.type}</h3>
          {activity?.ageRange && <Tag>{activity.ageRange[0]}–{activity.ageRange[1]} 月</Tag>}
          {activity && !activity.enabled && <Tag color="warning">未启用</Tag>}
        </div>
        <div className="content-inline content-step-actions">
          <Tooltip title="上移"><Button icon={<ArrowUpOutlined />} aria-label={`第 ${index + 1} 步上移`}
            disabled={context.disabled || index === 0} onClick={() => onMove(index - 1)} /></Tooltip>
          <Tooltip title="下移"><Button icon={<ArrowDownOutlined />} aria-label={`第 ${index + 1} 步下移`}
            disabled={context.disabled || index === count - 1} onClick={() => onMove(index + 1)} /></Tooltip>
          <Tooltip title="复制步骤"><Button icon={<CopyOutlined />} aria-label={`复制第 ${index + 1} 步`}
            disabled={context.disabled || count >= 8} onClick={onCopy} /></Tooltip>
          <Popconfirm title={`删除第 ${index + 1} 步？`} okText="删除" cancelText="保留" onConfirm={onDelete}>
            <Tooltip title="删除步骤"><Button danger icon={<DeleteOutlined />} aria-label={`删除第 ${index + 1} 步`}
              disabled={context.disabled} /></Tooltip>
          </Popconfirm>
        </div>
      </header>
      <SchemaObject {...context} schema={metadataSchema} path={path} value={draft.step}
        only={['title', 'parentTip']}
        onChange={(value) => {
          const next = asSchema(value);
          onChange({ ...draft, step: { ...draft.step, title: next.title as ActivityStep['title'], parentTip: next.parentTip as string | undefined } });
        }} />
      <div className="content-props-toolbar">
        <strong>活动参数</strong>
        <Segmented aria-label={`第 ${index + 1} 步编辑模式`} value={draft.mode}
          disabled={context.disabled}
          options={[
            { value: 'form', label: '表单', disabled: !activity?.schema || (draft.mode === 'json' && syntax.issues.length > 0) },
            { value: 'json', label: 'JSON', icon: <CodeOutlined /> },
          ]}
          onChange={(mode) => onChange({ ...draft, mode: mode as StepDraft['mode'], json: mode === 'json' ? JSON.stringify(draft.step.props, null, 2) : draft.json })} />
      </div>
      {draft.mode === 'form' && activity?.schema
        ? <SchemaObject {...context} schema={activity.schema} path={propsPath} value={draft.step.props} activityType={draft.step.type}
            onChange={(value) => {
              const next = asSchema(value);
              onChange({ ...draft, step: { ...draft.step, props: next }, json: JSON.stringify(next, null, 2) });
            }} />
        : <div data-content-path={propsPath} tabIndex={-1} className="content-json-editor">
            <Input.TextArea aria-label={`第 ${index + 1} 步 JSON`} className="content-json" value={draft.json}
              spellCheck={false} autoSize={{ minRows: 8, maxRows: 28 }} disabled={context.disabled}
              status={syntax.issues.length || propsIssues.some((issue) => issue.level === 'error') ? 'error' : undefined}
              onChange={(event) => {
                const json = event.target.value;
                const parsed = parsePropsJson(json);
                onChange({ ...draft, mode: 'json', json, step: parsed.value ? { ...draft.step, props: parsed.value } : draft.step });
              }} />
            <div className="content-inline">
              <Button size="small" disabled={!syntax.value || context.disabled}
                onClick={() => onChange({ ...draft, json: JSON.stringify(syntax.value, null, 2) })}>格式化 JSON</Button>
              <span className="muted" role="status">{syntax.issues.length ? 'JSON 格式有误' : 'JSON 格式正确'}</span>
            </div>
            <IssueList issues={propsIssues} />
          </div>}
    </section>
  );
}
