// Renders reel.html frame-by-frame in headless Chromium and encodes with ffmpeg.
// usage: node render.js [out.mp4] [--stills 0.5,3.1,...] [--from s --to s]
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname, FPS = 60, DUR = 15;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const outFile = args[0] && !args[0].startsWith('--') ? args[0] : path.join(ROOT, 'showreel.mp4');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/reel.html?render`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
  await page.goto(url);
  await page.evaluate(() => window.ready);
  const snap = async t => { await page.evaluate(t => window.renderFrame(t), t); return page.screenshot({ type: 'png' }); };

  const stills = opt('--stills');
  if (stills) {
    const dir = opt('--dir') || path.join(ROOT, 'stills'); fs.mkdirSync(dir, { recursive: true });
    for (const s of stills.split(',')) fs.writeFileSync(path.join(dir, `t${Number(s).toFixed(2)}.png`), await snap(Number(s)));
  } else {
    const from = Math.round(Number(opt('--from') || 0) * FPS), to = Math.round(Number(opt('--to') || DUR) * FPS);
    const audio = fs.existsSync(path.join(ROOT, 'soundtrack.wav')) && !args.includes('--mute');
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      ...(audio ? ['-ss', String(from / FPS), '-i', path.join(ROOT, 'soundtrack.wav')] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'film',
      ...(audio ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      const buf = await snap(f / FPS);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 60 === 0) process.stdout.write(`frame ${f}/${to}  ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('wrote', outFile);
  }
  await browser.close(); server.close();
})();
