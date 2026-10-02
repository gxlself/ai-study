import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // 不记录课程内容、孩子资料或管理员凭据。
  }
  render() {
    if (this.state.failed) return <Result status="warning" title="这个页面暂时无法打开"
      subTitle="已保存的数据不受影响，请刷新页面后重试。"
      extra={<Button type="primary" icon={<ReloadOutlined />} onClick={() => location.reload()}>重新加载</Button>} />;
    return this.props.children;
  }
}
