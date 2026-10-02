import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 使用本机已有 ffmpeg 生成无音轨、无闪烁的六秒本地视频。
const result = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi',
  '-i', 'color=c=0xdff1fb:s=640x360:r=12:d=6,drawbox=x=0:y=260:w=640:h=100:c=0xe6f4d7:t=fill,drawbox=x=260:y=120:w=120:h=120:c=0xf2b134:t=fill',
  '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  fileURLToPath(new URL('./assets/quiet-shape.mp4', import.meta.url)),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
