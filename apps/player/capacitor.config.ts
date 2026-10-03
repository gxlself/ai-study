import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sprout.growth',
  appName: '芽芽成长',
  webDir: 'dist',
  server: { androidScheme: 'http' },
  android: {
    allowMixedContent: true,
    backgroundColor: '#fdf6ec',
    initialFocus: true,
  },
  ios: {
    backgroundColor: '#fdf6ec',
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'App',
  },
  plugins: {
    SystemBars: { hidden: true },
  },
};

export default config;
