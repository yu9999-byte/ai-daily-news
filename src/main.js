/**
 * main.js - AI 资讯早报主入口
 * 编排：渲染帧 → TTS 配音 → 视频合成
 *
 * 用法: node src/main.js --brief brief.json --output output/
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { brief: '', output: 'output', skipTTS: false, skipRender: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--brief' && args[i + 1]) result.brief = args[i + 1];
    if (args[i] === '--output' && args[i + 1]) result.output = args[i + 1];
    if (args[i] === '--skip-tts') result.skipTTS = true;
    if (args[i] === '--skip-render') result.skipRender = true;
  }
  return result;
}

function runCommand(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch (e) {
    console.error(`命令失败: ${cmd}`);
    return false;
  }
}

function checkDependencies() {
  console.log('🔍 检查依赖...');
  let ok = true;

  try {
    execSync('node --version', { stdio: 'pipe' });
    console.log('  ✅ Node.js');
  } catch { console.log('  ❌ Node.js 未找到'); ok = false; }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('  ✅ FFmpeg');
  } catch { console.log('  ❌ FFmpeg 未找到'); ok = false; }

  try {
    execSync('python3 --version', { stdio: 'pipe' });
    console.log('  ✅ Python');
  } catch { console.log('  ❌ Python 未找到'); ok = false; }

  try {
    execSync('pip show edge-tts', { stdio: 'pipe' });
    console.log('  ✅ edge-tts');
  } catch { console.log('  ⚠️  edge-tts 未安装，TTS 将跳过'); }

  try {
    execSync('npx playwright --version', { stdio: 'pipe' });
    console.log('  ✅ Playwright');
  } catch { console.log('  ❌ Playwright 未找到'); ok = false; }

  return ok;
}

async function main() {
  const { brief: briefPath, output: outputDir, skipTTS, skipRender } = parseArgs();

  if (!briefPath) {
    console.error('错误: 请指定 --brief 参数（简报 JSON 文件路径）');
    console.log('用法: node src/main.js --brief examples/sample-brief.json --output output/');
    process.exit(1);
  }

  if (!fs.existsSync(briefPath)) {
    console.error(`错误: 找不到简报文件 ${briefPath}`);
    process.exit(1);
  }

  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  console.log(`\n📰 AI 早报 - ${brief.date || '未知日期'}`);
  console.log(`   ${brief.items?.length || 0} 条新闻\n`);

  // 检查依赖
  const depsOk = checkDependencies();
  if (!depsOk) {
    console.log('\n⚠️  部分依赖缺失，可能影响输出质量');
  }

  // 创建输出目录
  fs.mkdirSync(outputDir, { recursive: true });
  const framesDir = path.join(outputDir, 'frames');
  const audioDir = path.join(outputDir, 'audio');

  // 步骤 1: 渲染帧
  if (!skipRender) {
    console.log('\n' + '='.repeat(50));
    console.log('🎬 步骤 1/3: 渲染视频帧');
    console.log('='.repeat(50));
    const renderCmd = `node "${path.join(__dirname, 'render.js')}" --brief "${briefPath}" --out "${framesDir}"`;
    if (!runCommand(renderCmd)) {
      console.error('帧渲染失败，终止');
      process.exit(1);
    }
  } else {
    console.log('\n⏭️  跳过帧渲染');
  }

  // 步骤 2: TTS 配音
  let ttsOk = false;
  if (!skipTTS) {
    console.log('\n' + '='.repeat(50));
    console.log('🎙️  步骤 2/3: TTS 配音');
    console.log('='.repeat(50));

    try {
      execSync('pip show edge-tts', { stdio: 'pipe' });
      const ttsCmd = `python3 "${path.join(__dirname, 'tts.py')}" --brief "${briefPath}" --out "${audioDir}"`;
      ttsOk = runCommand(ttsCmd);
    } catch {
      console.log('edge-tts 未安装，跳过 TTS');
    }
  } else {
    console.log('\n⏭️  跳过 TTS 配音');
  }

  // 步骤 3: 视频合成
  console.log('\n' + '='.repeat(50));
  console.log('🎞️  步骤 3/3: 视频合成');
  console.log('='.repeat(50));

  const videoCmd = `node "${path.join(__dirname, 'video.js')}" --frames "${framesDir}" --audio "${audioDir}" --out "${outputDir}" --brief "${briefPath}"`;
  if (!runCommand(videoCmd)) {
    console.error('视频合成失败');
    process.exit(1);
  }

  // 完成
  const finalVideo = path.join(outputDir, 'daily-news.mp4');
  const keyframesDir = path.join(outputDir, 'keyframes');

  console.log('\n' + '='.repeat(50));
  console.log('✅ 完成！');
  console.log('='.repeat(50));
  console.log(`\n📹 成片: ${finalVideo}`);
  console.log(`🖼️  关键帧: ${keyframesDir}/`);
  console.log(`📝 旁白稿: ${briefPath} (narrationScript 字段)`);
  console.log(`⚠️  不稳定说明: ${brief.unstableNote || '无'}`);
}

main().catch(err => {
  console.error('\n❌ 运行失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
