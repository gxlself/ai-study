import { useState } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { ChildInput, type ChildProfile } from '@sprout/schema';

export function ChildForm({ child, onSave, label = '开始小旅程' }: { child?: ChildProfile; onSave(input: ChildInput): Promise<void>; label?: string }) {
  const now = new Date();
  const [name, setName] = useState(child?.name ?? '');
  const [year, setYear] = useState(child ? Number(child.birthday.slice(0, 4)) : now.getFullYear() - 2);
  const [month, setMonth] = useState(child ? Number(child.birthday.slice(5, 7)) : now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  async function save() {
    setSaving(true);
    setError('');
    try {
      const selectedMonth = Math.min(month, maxMonth);
      const unchanged = child && Number(child.birthday.slice(0, 4)) === year && Number(child.birthday.slice(5, 7)) === selectedMonth;
      const lastDay = year === now.getFullYear() && selectedMonth === now.getMonth() + 1 ? now.getDate() : new Date(year, selectedMonth, 0).getDate();
      const birthday = unchanged ? child.birthday : `${year}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const input = ChildInput.parse({ ...child, name: name.trim() || '芽芽', birthday });
      await onSave(input);
    } catch (e) { setError(e instanceof Error ? e.message : '暂时无法保存'); }
    finally { setSaving(false); }
  }
  return <div className="child-form">
    <label className="name-field">孩子的小名（选填）<input data-focusable value={name} maxLength={20} placeholder="芽芽" onChange={(e) => setName(e.target.value)} /></label>
    <p>出生年月</p>
    <div className="birthday-steppers">
      <div className="stepper">
        <button data-focusable aria-label="出生年加一" disabled={year >= now.getFullYear()} onClick={() => { setYear(year + 1); if (year + 1 === now.getFullYear()) setMonth(Math.min(month, now.getMonth() + 1)); }}><ChevronUp /></button>
        <output aria-label="出生年">{year}<small>年</small></output>
        <button data-focusable aria-label="出生年减一" disabled={year <= now.getFullYear() - 6} onClick={() => setYear(year - 1)}><ChevronDown /></button>
      </div>
      <div className="stepper">
        <button data-focusable aria-label="出生月加一" disabled={month >= maxMonth} onClick={() => setMonth(month + 1)}><ChevronUp /></button>
        <output aria-label="出生月">{month}<small>月</small></output>
        <button data-focusable aria-label="出生月减一" disabled={month <= 1} onClick={() => setMonth(month - 1)}><ChevronDown /></button>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" data-focusable disabled={saving} onClick={() => void save()}><Check />{saving ? '正在准备' : label}</button>
  </div>;
}
