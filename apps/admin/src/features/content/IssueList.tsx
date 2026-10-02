import { Alert, Button } from 'antd';
import type { ValidationIssue } from '@sprout/schema';
import { FIELD_LABELS, issueMessage, normalizeIssuePath } from './schema';

export function focusIssue(path: string, scope?: HTMLElement | null) {
  const root = scope ?? document;
  const normalized = normalizeIssuePath(path);
  const fields = [...root.querySelectorAll<HTMLElement>('[data-content-path]')];
  const exact = fields.find((field) => field.dataset.contentPath === normalized);
  const parent = fields
    .filter((field) => normalized.startsWith(`${field.dataset.contentPath}.`))
    .sort((a, b) => (b.dataset.contentPath?.length ?? 0) - (a.dataset.contentPath?.length ?? 0))[0];
  const child = fields.find((field) => field.dataset.contentPath?.startsWith(`${normalized}.`));
  const target = exact ?? parent ?? child ?? (scope || undefined);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  const input = target.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[role="combobox"]:not([aria-disabled="true"]),button:not([disabled])');
  (input ?? target).focus({ preventScroll: true });
}

export default function IssueList({ issues, onLocate }: {
  issues: ValidationIssue[];
  onLocate?: (path: string) => void;
}) {
  if (!issues.length) return null;
  const errors = issues.filter((issue) => issue.level === 'error').length;
  return (
    <Alert
      type={errors ? 'error' : 'warning'}
      showIcon
      title={errors ? `${errors} 项内容需要修正` : `${issues.length} 项提醒`}
      description={
        <ul className="content-issues" aria-live="polite">
          {issues.map((issue, index) => {
            const path = normalizeIssuePath(issue.path);
            const label = path.split('.').map((part) => /^\d+$/.test(part) ? `第 ${Number(part) + 1} 项` : FIELD_LABELS[part] ?? part).join(' / ');
            return (
              <li key={`${issue.path}-${index}`}>
                {onLocate
                  ? <Button type="link" onClick={() => onLocate(path)}>{label || '课程'}：{issueMessage(issue.message)}</Button>
                  : <span>{label ? `${label}：` : ''}{issueMessage(issue.message)}</span>}
                {issue.level === 'warning' && <span className="muted">（提醒）</span>}
              </li>
            );
          })}
        </ul>
      }
    />
  );
}
