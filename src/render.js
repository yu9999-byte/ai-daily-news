/**
 * render.js - Playwright 渲染脚本
 * 读取 brief.json，逐屏截图生成 PNG 帧序列
 *
 * 用法: node src/render.js --brief brief.json --out frames/
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/slide.html');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { brief: '', out: 'frames' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--brief' && args[i + 1]) result.brief = args[i + 1];
    if (args[i] === '--out' && args[i + 1]) result.out = args[i + 1];
  }
  return result;
}

async function main() {
  const { brief: briefPath, out: outDir } = parseArgs();

  if (!briefPath) {
    console.error('错误: 请指定 --brief 参数');
    process.exit(1);
  }

  // 读取简报数据
  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  const items = brief.items || [];
  const total = items.length;

  if (total === 0) {
    console.error('错误: 简报数据为空');
    process.exit(1);
  }

  // 创建输出目录
  fs.mkdirSync(outDir, { recursive: true });

  // 查找可用的 Chromium
  function findChromium() {
    const candidates = [
      process.env.PLAYWRIGHT_CHROMIUM_PATH,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null; // 让 Playwright 自己找
  }

  // 启动浏览器
  console.log('启动 Chromium...');
  const executablePath = findChromium();
  if (executablePath) {
    console.log(`使用浏览器: ${executablePath}`);
  }
  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // 加载模板
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  await page.setContent(templateHtml, { waitUntil: 'networkidle' });

  let frameIndex = 0;
  const frameInfo = []; // 记录每帧的类型和关联数据

  // 渲染片头
  console.log(`渲染片头 (${total} 条新闻)`);
  await page.evaluate((data) => window.renderSlide(data), {
    type: 'cover',
    date: brief.date,
    total: total,
    sourceChannel: brief.sourceChannel || '',
    sourceName: '',
    pageNum: ''
  });
  await page.waitForTimeout(300); // 等待渲染稳定
  const coverPath = path.join(outDir, `frame_${String(frameIndex).padStart(4, '0')}.png`);
  await page.screenshot({ path: coverPath, type: 'png' });
  frameInfo.push({ index: frameIndex, type: 'cover', duration: 3.0 });
  frameIndex++;

  // 渲染每条新闻
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`渲染新闻 ${i + 1}/${total}: ${item.title.substring(0, 30)}...`);

    await page.evaluate((data) => window.renderSlide(data), {
      type: 'news',
      index: item.index || (i + 1),
      total: total,
      title: item.title,
      points: item.points || [],
      keyNumbers: item.keyNumbers || [],
      sourceChannel: brief.sourceChannel || '',
      sourceName: item.sourceName || '',
      pageNum: `${i + 1} / ${total}`
    });
    await page.waitForTimeout(300);

    const newsPath = path.join(outDir, `frame_${String(frameIndex).padStart(4, '0')}.png`);
    await page.screenshot({ path: newsPath, type: 'png' });
    frameInfo.push({
      index: frameIndex,
      type: 'news',
      itemIndex: i,
      duration: 0 // 后面由 TTS 时长决定
    });
    frameIndex++;
  }

  // 渲染片尾
  console.log('渲染片尾');
  await page.evaluate((data) => window.renderSlide(data), {
    type: 'end',
    sourceChannel: brief.sourceChannel || '',
    sourceName: '',
    pageNum: ''
  });
  await page.waitForTimeout(300);
  const endPath = path.join(outDir, `frame_${String(frameIndex).padStart(4, '0')}.png`);
  await page.screenshot({ path: endPath, type: 'png' });
  frameInfo.push({ index: frameIndex, type: 'end', duration: 2.5 });
  frameIndex++;

  await browser.close();

  // 输出帧信息
  const infoPath = path.join(outDir, 'frames.json');
  fs.writeFileSync(infoPath, JSON.stringify(frameInfo, null, 2));

  console.log(`渲染完成，共 ${frameIndex} 帧，保存在 ${outDir}/`);
  console.log(`帧信息: ${infoPath}`);

  return { frameCount: frameIndex, frameInfo, outDir };
}

main().catch(err => {
  console.error('渲染失败:', err);
  process.exit(1);
});
