import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { DOMAIN_LABELS, DOMAINS, type ChildProfile, type ResolvedConcept } from '@sprout/schema';
import { Alert, Avatar, Button, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router';
import { EmptyState } from '../../components/ui';
import { formatDuration } from '../../lib/format';
import { avatarUrl, errorIssues, errorMessage } from './model';
import type { FamilyStats } from './types';
import './family.css';

export function RefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return (
    <Tooltip title="刷新">
      <Button aria-label="刷新" icon={<ReloadOutlined />} loading={loading} onClick={onClick} />
    </Tooltip>
  );
}

export function NoChild() {
  return <EmptyState description="还没有孩子档案" action={<Link to="/children">创建孩子档案</Link>} />;
}

export function ChildAvatar({ child, concepts, size = 56 }: {
  child: Pick<ChildProfile, 'avatar' | 'name'>;
  concepts: ResolvedConcept[];
  size?: number;
}) {
  return <Avatar size={size} src={avatarUrl(child.avatar, concepts)} alt={child.name} icon={<UserOutlined />} />;
}

export function MutationError({ error, title = '操作未完成' }: { error: unknown; title?: string }) {
  if (!error) return null;
  const issues = errorIssues(error);
  return (
    <Alert
      showIcon
      type="error"
      title={title}
      description={
        <div>
          <div>{errorMessage(error)}</div>
          {issues.length > 0 && <ul>{issues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>{issue.path && `${issue.path}：`}{issue.message}</li>
          ))}</ul>}
        </div>
      }
    />
  );
}

export function FetchWarning({ error, retry }: { error: Error | null; retry: () => void }) {
  if (!error) return null;
  return <Alert showIcon type="warning" title={error.message} action={<Button onClick={retry}>重试</Button>} />;
}

export function ScreenChart({ days }: { days: FamilyStats['days'] }) {
  if (!days.length) return <EmptyState description="这段时间还没有屏幕使用记录" />;
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const maximum = Math.max(...ordered.map((day) => day.screenSec), 60);
  return (
    <figure className="chart family-screen-chart">
      <figcaption className="muted">每日屏幕时间 · 分钟</figcaption>
      <div className="family-chart-columns" role="list" aria-label="每日屏幕使用时长">
        {ordered.map((day) => (
          <div className="family-chart-column" role="listitem" key={day.date}
            aria-label={`${day.date}，${formatDuration(day.screenSec)}`}>
            <span className="family-chart-value">{Math.round(day.screenSec / 6) / 10}</span>
            <div className="family-chart-track" aria-hidden="true">
              <div className="family-chart-bar" style={{ height: `${Math.max(0, day.screenSec) / maximum * 100}%` }} />
            </div>
            <span className="family-chart-date">{dayjs(day.date).format('M/D')}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

export function DomainDistribution({ domains }: { domains: FamilyStats['domains'] }) {
  const entries = DOMAINS.map((domain) => ({
    domain,
    seconds: Math.max(0, domains[domain] ?? 0),
    ...DOMAIN_LABELS[domain],
  })).filter((item) => item.seconds > 0);
  const total = entries.reduce((sum, entry) => sum + entry.seconds, 0);
  if (!total) return <EmptyState description="有学习记录后，会显示领域分布" />;
  return (
    <div className="family-domain-chart">
      <div className="family-domain-strip" aria-hidden="true">
        {entries.map((item) => (
          <span key={item.domain} style={{ width: `${item.seconds / total * 100}%`, background: item.color }} />
        ))}
      </div>
      <ul className="family-domain-list">
        {entries.map((item) => (
          <li key={item.domain}>
            <span><i className="family-swatch" style={{ background: item.color }} aria-hidden="true" />{item.zh}</span>
            <span>{Math.round(item.seconds / total * 100)}% <span className="muted">· {formatDuration(item.seconds)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
