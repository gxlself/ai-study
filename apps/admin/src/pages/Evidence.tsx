import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router';
import evidence from '../../../../docs/research/evidence-review.md?raw';
import { PageTitle } from '../components/ui';

export default function Evidence() {
  const navigate = useNavigate();
  return <>
    <PageTitle title="循证研究与设计依据" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/settings')}>家庭设置</Button>} />
    <section className="page-section"><pre className="evidence-document">{evidence}</pre></section>
  </>;
}
