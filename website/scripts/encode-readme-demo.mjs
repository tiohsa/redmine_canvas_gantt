// Reuse the manual's sanitized real-UI recordings. Requires ffmpeg and ffprobe.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const schedule = fileURLToPath(new URL('../public/videos/schedule-edit.mp4', import.meta.url));
const dependency = fileURLToPath(new URL('../public/videos/dependency-create.mp4', import.meta.url));
const output = fileURLToPath(new URL('../../docs/demo-current.gif', import.meta.url));
// Keep the original timing and final-frame holds, with a shared canvas size.
const filters = [
  '[0:v]fps=12,pad=1280:472:0:0:color=white,setsar=1,setpts=PTS-STARTPTS[schedule]',
  '[1:v]fps=12,setsar=1,setpts=PTS-STARTPTS[dependency]',
  '[schedule][dependency]concat=n=2:v=1:a=0,split[frames][paletteSource]',
  '[paletteSource]palettegen=stats_mode=diff[palette]',
  '[frames][palette]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]',
].join(';');
const result = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', schedule, '-i', dependency,
  '-filter_complex', filters, '-map', '[out]', '-loop', '0', output,
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('README demo encoding failed');
const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration,size',
  '-of', 'json', output,
], { stdio: 'inherit' });
if (probe.error) throw probe.error;
if (probe.status !== 0) throw new Error('README demo verification failed');
