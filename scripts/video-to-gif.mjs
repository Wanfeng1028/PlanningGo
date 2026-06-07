import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const videoPath = join(root, 'dist', 'planninggo-browser-full-demo-20260608.mp4');
const gifPath = join(root, 'public', 'design', 'demo.gif');

// 截取视频前 5 秒，转 GIF，宽度 800px
const cmd = `"${ffmpeg.path}" -ss 0 -t 5 -i "${videoPath}" -vf "fps=10,scale=800:-1:flags=lanczos" -loop 0 "${gifPath}"`;

console.log('Converting video to GIF...');
execSync(cmd, { stdio: 'inherit' });
console.log('Done! GIF saved to:', gifPath);
