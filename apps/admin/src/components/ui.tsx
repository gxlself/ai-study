import type { ReactNode } from 'react';
import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DOMAIN_LABELS, type Audience, type Domain } from '@sprout/schema';

export function PageTitle({ title, subtitle, extra }: { title: string; subtitle?: ReactNode; extra?: ReactNode }) {
  return <header className="page-title"><div><h1>{title}</h1>{subtitle && <div className="muted">{subtitle}</div>}</div>{extra && <div className="page-actions">{extra}</div>}</header>;
}

export function DomainTags({ domains }: { domains: Domain[] }) {
  return <span className="domain-tags">{domains.map((domain) => {
    const label = DOMAIN_LABELS[domain];
    return <Tag key={domain} color={label.color}>{label.zh}</Tag>;
  })}</span>;
}

export function LessonTypeTags({ audience, hasPrintables = false }: { audience?: Audience; hasPrintables?: boolean }) {
  return <span className="lesson-type-tags">
    <Tag color={audience === 'parent' ? 'gold' : 'blue'}>{audience === 'parent' ? '家长指引课' : '亲子共看课'}</Tag>
    {hasPrintables && <Tag color="green">可打印</Tag>}
  </span>;
}

export function ResourceState({ loading, error, retry, children }: {
  loading: boolean; error?: Error | null; retry?: () => void; children: ReactNode;
}) {
  if (loading) return <div className="loading-state" role="status" aria-label="正在加载"><Skeleton active paragraph={{ rows: 5 }} /></div>;
  if (error) return <Alert type="error" showIcon title="暂时未能加载" description={error.message} action={retry && <Button icon={<ReloadOutlined />} onClick={retry}>重试</Button>} />;
  return <>{children}</>;
}

export function EmptyState({ description, action }: { description: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>{action}</Empty></div>;
}
