import { Alert, App } from 'antd';
import type { Dayjs } from 'dayjs';
import { birthdayWarning } from './model';

export function BirthdayWarning({ birthday }: { birthday: Dayjs | null | undefined }) {
  const warning = birthdayWarning(birthday);
  if (!warning) return null;
  return <Alert type="warning" showIcon title={warning.message}
    description={warning.future ? '生日晚于今天，请改为宝宝真实的出生日期。' : '课程从 6 个月起安排，未满 6 个月时仅供家长提前学习。'} />;
}

export function useBirthdayConfirmation() {
  const { modal } = App.useApp();
  return (birthday: Dayjs | null | undefined): Promise<boolean> => {
    const warning = birthdayWarning(birthday);
    if (!warning) return Promise.resolve(true);
    if (warning.future) return Promise.resolve(false);
    return new Promise((resolve) => {
      modal.confirm({
        title: warning.message,
        content: `填写的生日是 ${birthday!.format('YYYY-MM-DD')}。请再次确认这是宝宝真实的出生日期。`,
        okText: '确认生日并保存',
        cancelText: '返回修改',
        onOk: () => { resolve(true); },
        onCancel: () => { resolve(false); },
      });
    });
  };
}
