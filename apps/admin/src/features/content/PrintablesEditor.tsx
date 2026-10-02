import { DeleteOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Popconfirm, Select, Switch, Tooltip } from 'antd';
import { ContrastPattern, type Printable, type ResolvedConcept, type ValidationIssue } from '@sprout/schema';
import { preferredConcepts } from './model';
import { ENUM_LABELS, issuesAt } from './schema';

export default function PrintablesEditor({ value = [], onChange, concepts, issues = [], disabled }: {
  value?: Printable[];
  onChange: (value: Printable[] | undefined) => void;
  concepts: ResolvedConcept[];
  issues?: ValidationIssue[];
  disabled?: boolean;
}) {
  const options = preferredConcepts(concepts).map((concept) => ({
    value: concept.id, label: `${concept.zh} · ${concept.en}`, search: `${concept.id} ${concept.zh} ${concept.en} ${concept.pinyin ?? ''}`,
    imageUrl: concept.imageUrl,
  }));
  function update(index: number, next: Printable) {
    onChange(value.map((item, current) => current === index ? next : item));
  }
  return <div className="content-printables" data-content-path="printables" tabIndex={-1}>
    <div className="content-section-heading"><h2><PrinterOutlined /> 可打印实体材料</h2><span className="muted">{value.length} / 4 组</span></div>
    <p className="muted">宝宝在屏幕外看卡片、拿实物；打印后剪圆边角，啃咬和玩耍时须成人看护。</p>
    {value.map((item, index) => {
      const path = `printables.${index}`;
      const itemIssues = issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
      return <section key={index} className="content-printable-item" data-content-path={path} tabIndex={-1}>
        <div className="content-section-heading">
          <h3>材料 {index + 1}</h3>
          <Popconfirm title="删除这组打印材料？" okText="删除" cancelText="保留"
            onConfirm={() => { const next = value.filter((_, position) => position !== index); onChange(next.length ? next : undefined); }}>
            <Tooltip title="删除材料"><Button aria-label={`删除打印材料 ${index + 1}`} danger icon={<DeleteOutlined />} disabled={disabled} /></Tooltip>
          </Popconfirm>
        </div>
        <div className="content-schema-object">
          <div className="content-field" data-content-path={`${path}.kind`} tabIndex={-1}>
            <label htmlFor={`printable-kind-${index}`}>材料类型</label>
            <Select id={`printable-kind-${index}`} aria-label={`打印材料 ${index + 1} 类型`} value={item.kind} disabled={disabled}
              options={[{ value: 'cards', label: '词库实体卡片' }, { value: 'contrast', label: '整版高对比卡片' }]}
              onChange={(kind) => update(index, kind === 'cards'
                ? { kind, title: item.title, items: [], size: 'large', showText: true, showEnglish: true }
                : { kind, title: item.title, patterns: ['circle'], palette: 'bw' })} />
          </div>
          <div className="content-field" data-content-path={`${path}.title`} tabIndex={-1}>
            <label htmlFor={`printable-title-${index}`}>材料标题 *</label>
            <Input id={`printable-title-${index}`} aria-label={`打印材料 ${index + 1} 标题`} value={item.title} disabled={disabled}
              status={issuesAt(issues, `${path}.title`).some((issue) => issue.level === 'error') ? 'error' : undefined}
              onChange={(event) => update(index, { ...item, title: event.target.value })} />
          </div>
          {item.kind === 'cards' ? <>
            <div className="content-field content-field-array" data-content-path={`${path}.items`} tabIndex={-1}>
              <label htmlFor={`printable-items-${index}`}>词条（最多 24 张）*</label>
              <Select id={`printable-items-${index}`} aria-label={`打印材料 ${index + 1} 词条`} mode="multiple"
                value={item.items.filter((ref): ref is string => typeof ref === 'string')} disabled={disabled} maxCount={24}
                options={options} showSearch filterOption={(input, option) => !!option?.search.toLowerCase().includes(input.toLowerCase())}
                optionRender={(option) => <span className="content-concept-option"><img src={option.data.imageUrl} alt="" /><span>{option.label}</span></span>}
                onChange={(ids) => update(index, { ...item, items: [...ids, ...item.items.filter((ref) => typeof ref !== 'string')] })} />
              {item.items.some((ref) => typeof ref !== 'string') && <Alert type="info" showIcon
                title={`${item.items.filter((ref) => typeof ref !== 'string').length} 张内联自定义卡片已保留`}
                description="改变词库选择不会删除原有内联卡片。" />}
            </div>
            <div className="content-field" data-content-path={`${path}.size`} tabIndex={-1}>
              <label htmlFor={`printable-size-${index}`}>卡片尺寸</label>
              <Select id={`printable-size-${index}`} aria-label={`打印材料 ${index + 1} 尺寸`} disabled={disabled} value={item.size}
                options={[{ value: 'large', label: '大卡 · 每页 2 张' }, { value: 'medium', label: '中卡 · 每页 4 张' }, { value: 'small', label: '小卡 · 每页 8 张' }]}
                onChange={(size) => update(index, { ...item, size })} />
            </div>
            <div className="content-inline">
              <Switch aria-label={`打印材料 ${index + 1} 显示中文`} disabled={disabled} checked={item.showText} onChange={(showText) => update(index, { ...item, showText })} />
              <span>中文大字</span>
              <Switch aria-label={`打印材料 ${index + 1} 显示英文`} disabled={disabled} checked={item.showEnglish} onChange={(showEnglish) => update(index, { ...item, showEnglish })} />
              <span>英文</span>
            </div>
          </> : <>
            <div className="content-field content-field-array" data-content-path={`${path}.patterns`} tabIndex={-1}>
              <label htmlFor={`printable-patterns-${index}`}>高对比图案 *</label>
              <Select id={`printable-patterns-${index}`} aria-label={`打印材料 ${index + 1} 图案`} mode="multiple" disabled={disabled}
                maxCount={12} value={item.patterns} options={ContrastPattern.options.map((pattern) => ({ value: pattern, label: ENUM_LABELS[pattern] ?? pattern }))}
                onChange={(patterns) => update(index, { ...item, patterns })} />
            </div>
            <div className="content-field" data-content-path={`${path}.palette`} tabIndex={-1}>
              <label htmlFor={`printable-palette-${index}`}>配色</label>
              <Select id={`printable-palette-${index}`} aria-label={`打印材料 ${index + 1} 配色`} disabled={disabled} value={item.palette}
                options={[{ value: 'bw', label: '黑白' }, { value: 'bwr', label: '黑白红' }]}
                onChange={(palette) => update(index, { ...item, palette })} />
            </div>
          </>}
        </div>
        {itemIssues.map((issue, position) => <p key={position} className={issue.level === 'error' ? 'content-field-error' : 'content-field-warning'} role="alert">
          {issue.path}：{issue.message}
        </p>)}
      </section>;
    })}
    <Button icon={<PlusOutlined />} type="dashed" disabled={disabled || value.length >= 4} onClick={() => onChange([
      ...value, { kind: 'cards', title: '', items: [], size: 'large', showText: true, showEnglish: true },
    ])}>添加打印材料</Button>
  </div>;
}
