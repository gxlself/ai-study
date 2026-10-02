import { useState } from 'react';
import { Alert, Button, Modal, Tag } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import type { PackInfo } from '@sprout/schema';
import { useResource } from '../../lib/hooks';
import { EmptyState, ResourceState } from '../../components/ui';
import { CreditsList } from './shared';
import type { HealthStatus } from './types';
import { Link } from 'react-router';

export function AboutSettings() {
  const health = useResource<HealthStatus>('/api/health');
  const packs = useResource<PackInfo[]>('/api/packs');
  const [principlesOpen, setPrinciplesOpen] = useState(false);
  return (
    <section className="page-section stacked" aria-labelledby="about-settings-title">
      <div className="system-section-heading">
        <h2 id="about-settings-title">关于芽芽成长 Sprout</h2>
        <ResourceState loading={health.loading} error={health.error} retry={health.reload}>
          {health.data && <Tag color="green">服务端 v{health.data.version}</Tag>}
        </ResourceState>
      </div>
      <p>亲子共学，屏幕只是引子。课程以家长陪伴、慢节奏互动和线下延伸活动为中心，不设排行榜，不自动连播。</p>
      <div>
        <Button icon={<BookOutlined />} onClick={() => setPrinciplesOpen(true)}>共学理念与参考说明</Button>
        <Link className="system-doc-link" to="/about/evidence">阅读循证研究全文</Link>
      </div>
      <h3>开源素材与内容许可</h3>
      <ResourceState loading={packs.loading} error={packs.error} retry={packs.reload}>
        {packs.data?.length ? packs.data.map((pack) => (
          <details key={pack.id}>
            <summary>{pack.name.zh} · {pack.license || '未声明内容许可'}</summary>
            <CreditsList credits={pack.credits} />
          </details>
        )) : <EmptyState description="暂无可显示的内容包署名与许可。" />}
      </ResourceState>
      <Modal
        open={principlesOpen}
        title="共学理念与参考说明"
        className="system-dialog"
        onCancel={() => setPrinciplesOpen(false)}
        footer={<Button onClick={() => setPrinciplesOpen(false)}>关闭</Button>}
      >
        <div className="stacked">
          <p>芽芽成长是亲子共学工具，不是电子保姆。屏幕像一本会说话的绘本，家长的陪伴和屏幕外的真实互动才是课程的中心。</p>
          <ul className="system-steps">
            <li>家长一起看、一起说，课程结束后继续线下活动。</li>
            <li>保持慢节奏、温和反馈，不自动连播，也不提供积分或排行榜。</li>
            <li>按成长阶段安排短时共学，并尊重每个孩子的兴趣与节奏。</li>
          </ul>
          <Alert
            type="info"
            showIcon
            title="参考循证研究第 9 节"
            description="国家卫健委、教育部、WHO 与 AAP 的相关口径支持尽量减少婴幼儿屏幕接触；本项目在 6–17 月龄仅提供家长指引，18–23 月龄共看默认关闭，24 个月后仍须全程陪同。家庭观察不作为诊断结果。"
          />
          <div>
            <strong>仓库内文档</strong>
            <p className="system-wrap">家长使用说明：<code>docs/dev/admin.md</code></p>
            <p className="system-wrap">项目设计原则：<code>docs/dev/architecture.md</code></p>
            <p className="system-wrap">循证研究：<code>docs/research/evidence-review.md</code> 第 9 节</p>
          </div>
        </div>
      </Modal>
    </section>
  );
}
