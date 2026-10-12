// ffmpeg and ffprobe must be installed. Raw browser recordings stay outside git.
import { readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const raw = process.env.REDMINE_CAPTURE_RAW_DIR ?? '/tmp/canvas-gantt-manual-recordings';
const output = fileURLToPath(new URL('../public/videos/', import.meta.url));
const locale = process.env.REDMINE_CAPTURE_LOCALE ?? 'en';
if (!['en', 'ja'].includes(locale)) throw new Error('REDMINE_CAPTURE_LOCALE must be en or ja.');
await mkdir(output, { recursive: true });
for (const [phase, name] of [['schedule','schedule-edit'], ['dependency','dependency-create']]) {
 const filename = locale === 'en' ? `${name}.mp4` : `${name}-${locale}.mp4`;
 const take = JSON.parse(await readFile(`${raw}/${phase}.json`, 'utf8'));
 if (take.errors.length) throw new Error(`Browser errors in ${phase}`);
 const {x,y,width,height} = take.clip;
 const hold = phase === 'schedule' ? 4 : 2;
 const filters = `trim=duration=${take.duration},setpts=PTS-STARTPTS,crop=${Math.floor(width/2)*2}:${Math.floor(height/2)*2}:${x}:${y},scale=1280:-2,fps=25,tpad=stop_mode=clone:stop_duration=${hold}`;
 const result = spawnSync('ffmpeg', ['-y','-v','error','-ss',String(take.start),'-i',take.source,'-t',String(take.duration + hold),'-vf',filters,'-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-an','-movflags','+faststart',`${output}${filename}`], {stdio:'inherit'});
 if (result.status !== 0) throw new Error(`Encoding failed: ${phase}`);
 const probe = spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height:format=duration,size','-of','json',`${output}${filename}`], {encoding:'utf8'});
 console.log(filename, probe.stdout);
}
