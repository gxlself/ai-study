import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Drawer, Modal, Popconfirm, Tabs, Tag,
} from 'antd';
import {
  DeleteOutlined, DownloadOutlined, FileSearchOutlined, ImportOutlined,
  ReloadOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { PackInfo, ValidationIssue } from '@sprout/schema';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { formatAge } from '../lib/format';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import {
  ActionError, ConfirmedSwitch, CreditsList, FilePicker, IssueList, useSystemAction,
} from '../features/system/shared';
import { downloadName } from '../features/system/helpers';
import '../features/system/system.css';

const SOURCE_LABELS: Record<PackInfo['source'], string> = {
  builtin: '内置内容', installed: '导入内容', custom: '家庭自建',
};

function PackDetails({
  pack, initialTab, onClose, onValidated,
}: {
  pack: PackInfo;
  initialTab: 'validation' | 'credits';
  onClose: () => void;
  onValidated: (id: string, issues: ValidationIssue[]) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const result = useResource<{ issues: ValidationIssue[] }>(
    tab === 'validation' ? `/api/packs/${encodeURIComponent(pack.id)}/validate` : null,
  );

  useEffect(() => {
    if (result.data) onValidated(pack.id, result.data.issues);
  }, [pack.id, result.data, onValidated]);

  return (
    <Drawer
      open
      title={pack.name.zh}
      onClose={onClose}
      size={600}
      className="system-page"
    >
      <p className="muted system-wrap">{pack.id} · v{pack.version}</p>
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          {
            key: 'validation',
            label: '内容校验',
            children: (
              <div className="stacked">
                <div className="toolbar">
                  <span>课程结构与内容引用</span>
                  <Button icon={<ReloadOutlined />} loading={result.loading} onClick={() => result.reload()}>
                    重新校验
                  </Button>
                </div>
                {!!pack.errors?.length && (
                  <Alert
                    type="error"
                    showIcon
                    title="扫描时发现问题"
                    description={<ul>{pack.errors.map((error, index) => <li key={index} className="system-wrap">{error}</li>)}</ul>}
                  />
                )}
                <ResourceState loading={result.loading} error={result.error} retry={result.reload}>
                  {result.data && (
                    <>
                      <div className="system-inline">
                        <Tag color={result.data.issues.some((issue) => issue.level === 'error') ? 'error' : 'success'}>
                          {result.data.issues.filter((issue) => issue.level === 'error').length} 项错误
                        </Tag>
                        <Tag color="warning">
                          {result.data.issues.filter((issue) => issue.level === 'warning').length} 项提醒
                        </Tag>
                      </div>
                      <IssueList issues={result.data.issues} />
                    </>
                  )}
                </ResourceState>
              </div>
            ),
          },
          {
            key: 'credits',
            label: '署名与许可',
            children: (
              <div>
                <dl className="system-metadata">
                  <div><dt>内容作者</dt><dd>{pack.author || '尚未提供'}</dd></div>
                  <div><dt>内容许可</dt><dd>{pack.license || '尚未声明'}</dd></div>
                </dl>
                <CreditsList credits={pack.credits} />
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

export default function Packs() {
  const resource = useResource<PackInfo[]>('/api/packs');
  const action = useSystemAction();
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<{ pack: PackInfo; tab: 'validation' | 'credits' } | null>(null);
  const [checkedIssues, setCheckedIssues] = useState<Record<string, ValidationIssue[]>>({});
  const [importIssues, setImportIssues] = useState<ValidationIssue[]>([]);
  const disabled = action.busy || resource.loading;
  const onValidated = useCallback((id: string, issues: ValidationIssue[]) => {
    setCheckedIssues((previous) => ({ ...previous, [id]: issues }));
  }, []);

  function refresh() {
    setCheckedIssues({});
    resource.reload();
  }

  function openImport() {
    action.clearError();
    setFile(null);
    setImportIssues([]);
    setImportOpen(true);
  }

  async function importPack() {
    if (!file) return;
    const success = await action.run('import', async () => {
      const result = await api.upload<PackInfo & { issues?: ValidationIssue[] }>('/api/packs/import', file);
      setImportIssues(result.issues ?? []);
      refresh();
    }, '内容包已导入。');
    if (success) { setImportOpen(false); setFile(null); }
  }

  return (
    <div className="system-page">
      {action.feedback}
      <PageTitle
        title="内容包"
        subtitle="家庭的课程、词库与素材"
        extra={
          <div className="system-actions">
            <Button
              icon={<ReloadOutlined />}
              loading={action.pending === 'scan'}
              disabled={disabled}
              onClick={() => void action.run('scan', async () => {
                await api.post<PackInfo[]>('/api/packs/reload');
                refresh();
              }, '内容包已重新扫描。')}
            >
              重新扫描
            </Button>
            <Button type="primary" icon={<ImportOutlined />} disabled={disabled} onClick={openImport}>
              导入 ZIP
            </Button>
          </div>
        }
      />
      <section className="page-section stacked" aria-label="内容包列表">
        {!importOpen && <ActionError error={action.error} />}
        {importIssues.length > 0 && (
          <Alert type="warning" showIcon title="导入校验结果" description={<IssueList issues={importIssues} />} />
        )}
        <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
          {resource.data?.length ? (
            <div className="item-grid">
              {resource.data.map((pack) => {
                const issues = checkedIssues[pack.id];
                const count = issues ? issues.length : (pack.errors?.length ?? 0);
                return (
                  <article className="system-item" key={pack.id}>
                    <div className="system-item-header">
                      <div>
                        <h3 className="system-wrap">{pack.name.zh}</h3>
                        <p className="muted system-wrap">{pack.id} · v{pack.version}</p>
                      </div>
                      <ConfirmedSwitch
                        checked={pack.enabled}
                        label={`${pack.enabled ? '停用' : '启用'}内容包 ${pack.name.zh}`}
                        title={`停用「${pack.name.zh}」？`}
                        description="该内容包中的课程与词条将不再供播放端使用。已有学习记录不会因此删除。"
                        disabled={disabled}
                        loading={action.pending === `toggle:${pack.id}`}
                        onChange={(enabled) => action.run(`toggle:${pack.id}`, async () => {
                          await api.put(`/api/packs/${encodeURIComponent(pack.id)}`, { enabled });
                          refresh();
                        }, enabled ? '内容包已启用。' : '内容包已停用。')}
                      />
                    </div>
                    <Tag color={pack.source === 'builtin' ? 'blue' : pack.source === 'custom' ? 'green' : 'default'}>
                      {SOURCE_LABELS[pack.source]}
                    </Tag>
                    {pack.description?.zh && <p className="system-wrap">{pack.description.zh}</p>}
                    <dl className="system-metadata">
                      <div><dt>课程</dt><dd>{pack.lessonCount} 节</dd></div>
                      <div><dt>词条</dt><dd>{pack.conceptCount} 个</dd></div>
                      <div><dt>适用月龄</dt><dd>{formatAge(pack.ageRange[0])}至{formatAge(pack.ageRange[1])}</dd></div>
                      <div><dt>许可</dt><dd>{pack.license || '未声明'}</dd></div>
                    </dl>
                    <div className="system-actions">
                      <Button
                        icon={<FileSearchOutlined />}
                        onClick={() => setDetails({ pack, tab: 'validation' })}
                      >
                        校验问题 {issues || count
                          ? <Badge count={count} showZero color={count ? '#c45a32' : '#55766c'} overflowCount={999} />
                          : <Tag>待校验</Tag>}
                      </Button>
                      <Button icon={<SafetyCertificateOutlined />} onClick={() => setDetails({ pack, tab: 'credits' })}>
                        署名
                      </Button>
                      <Button
                        icon={<DownloadOutlined />}
                        disabled={disabled}
                        loading={action.pending === `export:${pack.id}`}
                        onClick={() => void action.run(`export:${pack.id}`, () =>
                          api.download(`/api/packs/${encodeURIComponent(pack.id)}/export`, downloadName(pack.id, pack.version)),
                        '内容包已下载。')}
                      >
                        导出
                      </Button>
                      {pack.source === 'installed' && (
                        <Popconfirm
                          title={`删除「${pack.name.zh}」？`}
                          description={<div className="system-confirm-copy">将删除此导入包及其素材，相关课程将不可用。建议先导出留存。</div>}
                          okText="删除内容包"
                          cancelText="取消"
                          okButtonProps={{ danger: true, loading: action.pending === `delete:${pack.id}` }}
                          onConfirm={() => action.run(`delete:${pack.id}`, async () => {
                            await api.delete(`/api/packs/${encodeURIComponent(pack.id)}`);
                            refresh();
                          }, '内容包已删除。')}
                        >
                          <Button danger icon={<DeleteOutlined />} disabled={disabled}>删除</Button>
                        </Popconfirm>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              description="还没有内容包，导入课程包后即可开始安排共学内容。"
              action={<Button type="primary" icon={<ImportOutlined />} onClick={openImport}>导入内容包</Button>}
            />
          )}
        </ResourceState>
      </section>
      {details && (
        <PackDetails
          key={`${details.pack.id}:${details.tab}`}
          pack={details.pack}
          initialTab={details.tab}
          onClose={() => setDetails(null)}
          onValidated={onValidated}
        />
      )}
      <Modal
        open={importOpen}
        title="导入内容包"
        className="system-dialog"
        onCancel={() => { if (!action.busy) setImportOpen(false); }}
        closable={!action.busy}
        keyboard={!action.busy}
        maskClosable={!action.busy}
        destroyOnHidden
        footer={[
          <Button key="cancel" disabled={action.busy} onClick={() => setImportOpen(false)}>取消</Button>,
          <Popconfirm
            key="import"
            title="确认导入此内容包？"
            description={<div className="system-confirm-copy">若包 ID 相同，更高版本会覆盖原内容。请确认已保留需要的旧版本。</div>}
            okText="确认导入"
            cancelText="再检查一下"
            okButtonProps={{ loading: action.pending === 'import' }}
            onConfirm={importPack}
            disabled={!file || action.busy}
          >
            <Button type="primary" icon={<ImportOutlined />} disabled={!file || action.busy} loading={action.pending === 'import'}>
              导入
            </Button>
          </Popconfirm>,
        ]}
      >
        <div className="stacked">
          <Alert
            type="warning"
            showIcon
            title="同 ID 的高版本内容包会覆盖旧版本"
            description="ZIP 根目录或单一子目录中需包含 pack.json。仅导入来源可信且拥有使用许可的内容。"
          />
          <FilePicker file={file} extension="zip" onChange={setFile} disabled={action.busy} />
          <ActionError error={action.error} />
        </div>
      </Modal>
    </div>
  );
}
