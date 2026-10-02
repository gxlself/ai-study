import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sprout.growth',
  appName: '芽芽成长',
  webDir: 'dist',
  server: { androidScheme: 'http' },
  android: { allowMixedContent: true },
};

export default config;
