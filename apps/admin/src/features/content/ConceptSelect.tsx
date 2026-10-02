import { useMemo } from 'react';
import { PictureOutlined } from '@ant-design/icons';
import { Select } from 'antd';
import type { ResolvedConcept } from '@sprout/schema';
import { CATEGORY_LABELS, preferredConcepts } from './model';

export default function ConceptSelect({ id, value, onChange, concepts, disabled, packId, label = '词条', invalid = false }: {
  id?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  concepts: ResolvedConcept[];
  disabled?: boolean;
  packId?: string;
  label?: string;
  invalid?: boolean;
}) {
  const options = useMemo(() => {
    const items = preferredConcepts(concepts, packId).map((concept) => ({
      value: concept.id,
      label: `${concept.zh} · ${concept.en}`,
      search: `${concept.id} ${concept.zh} ${concept.en} ${concept.pinyin ?? ''} ${CATEGORY_LABELS[concept.category]}`.toLowerCase(),
      concept,
    }));
    if (value && !items.some((item) => item.value === value)) {
      return [...items, { value, label: `未找到词条：${value}`, search: value.toLowerCase(), concept: undefined }];
    }
    return items;
  }, [concepts, packId, value]);
  return (
    <Select
      id={id}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className="content-full-width"
      value={value || undefined}
      options={options}
      disabled={disabled}
      allowClear
      showSearch
      status={invalid ? 'error' : undefined}
      placeholder="选择词条"
      filterOption={(input, option) => !!option?.search.includes(input.toLowerCase())}
      optionRender={(option) => (
        <span className="content-concept-option">
          {option.data.concept?.imageUrl
            ? <img src={option.data.concept.imageUrl} alt="" loading="lazy" />
            : <PictureOutlined />}
          <span>
            <strong>{option.data.label}</strong>
            <small>{option.data.concept?.pinyin || option.data.value}</small>
          </span>
        </span>
      )}
      onChange={onChange}
    />
  );
}
