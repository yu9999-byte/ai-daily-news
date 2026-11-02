/**
 * video.js - FFmpeg 视频合成脚本
 * 将帧截图 + 旁白音频 + 字幕 合成为最终 mp4
 *
 * 用法: node src/video.js --frames frames/ --audio audio/ --out output/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const TRANSITION_DURATION = 0.6; // 过渡静音时长

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { frames: 'frames', audio: 'audio', out: 'output', brief: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frames' && args[i + 1]) result.frames = args[i + 1];
    if (args[i] === '--audio' && args[i + 1]) result.audio = args[i + 1];
    if (args[i] === '--out' && args[i + 1]) result.out = args[i + 1];
    if (args[i] === '--brief' && args[i + 1]) result.brief = args[i + 1];
  }
  return result;
}

/**
 * 为每帧生成独立的视频片段（静态图片 + 指定时长）
 */
function generateFrameClips(frameInfo, framesDir, clipsDir) {
  fs.mkdirSync(clipsDir, { recursive: true });
  const clipFiles = [];

  for (let i = 0; i < frameInfo.length; i++) {
    const frame = frameInfo[i];
    const frameFile = path.join(framesDir, `frame_${String(frame.index).padStart(4, '0')}.png`);
    const clipFile = path.join(clipsDir, `clip_${String(i).padStart(4, '0')}.mp4`);
    const duration = frame.duration || 3.0;

    console.log(`生成片段 ${i + 1}/${frameInfo.length} (${duration.toFixed(1)}s)...`);

    // 用 ffmpeg 把静态图片生成指定时长的视频
    execSync(
      `ffmpeg -y -loop 1 -i "${frameFile}" -t ${duration} ` +
      `-c:v libx264 -preset ultrafast -pix_fmt yuv420p -r ${FPS} -vf "scale=1920:1080" ` +
      `-an "${clipFile}"`,
      { stdio: 'pipe' }
    );

    clipFiles.push(clipFile);
  }

  return clipFiles;
}

/**
 * 生成 ASS 字幕文件
 * 字幕位置：画面下 1/5 区域，半透明黑条，逐句淡入淡出
 */
function generateAssSubtitles(sentenceInfo, frameInfo, brief) {
  const width = 1920;
  const height = 1080;

  // 计算每句字幕的开始和结束时间
  // 假设句子顺序对应新闻页顺序，片头和片尾没有旁白
  const subs = [];
  let currentTime = 0;

  // 片头时长
  const coverDuration = frameInfo[0]?.duration || 3.0;
  currentTime += coverDuration;

  // 新闻页 + 过渡
  let sentenceIdx = 0;
  for (let i = 1; i < frameInfo.length; i++) {
    const frame = frameInfo[i];
    if (frame.type === 'end') break;

    const frameDuration = frame.duration || 5.0;
    const frameStart = currentTime;

    // 这一帧可能对应多句旁白，按句子分配
    // 简单策略：每帧的旁白句数 = 总句数 / 新闻帧数，向上取整
    // 更准确的做法是在 brief.json 里指定每帧对应哪些句子
    const sentencesPerFrame = Math.ceil(sentenceInfo.length / (frameInfo.length - 2)); // 减去片头片尾
    const startSentence = sentenceIdx;
    const endSentence = Math.min(startSentence + sentencesPerFrame, sentenceInfo.length);

    let sentenceTime = frameStart + 0.3; // 每帧开始后 0.3s 出第一句
    for (let j = startSentence; j < endSentence; j++) {
      const sent = sentenceInfo[j];
      const startTime = sentenceTime;
      const endTime = sentenceTime + sent.duration;

      // 字幕文本换行处理（每行 12-15 字）
      const lines = wrapText(sent.text, 14);

      subs.push({
        start: formatTime(startTime),
        end: formatTime(endTime),
        text: lines.join('\\N')
      });

      sentenceTime += sent.duration + 0.1; // 句间 0.1s 间隔
      sentenceIdx++;
    }

    currentTime += frameDuration + TRANSITION_DURATION;
  }

  // 生成 ASS 文件内容
  const assContent = generateAssContent(width, height, subs);
  return assContent;
}

function wrapText(text, maxChars) {
  const lines = [];
  let current = '';
  for (const char of text) {
    current += char;
    if (current.length >= maxChars) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // 最多 3 行
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function generateAssContent(width, height, subs) {
  return `[Script Info]
Title: AI Daily News Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,PingFang SC,36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,120,120,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${subs.map((s, i) => `Dialogue: 0,${s.start},${s.end},Default,,0,0,0,,${s.text}`).join('\n')}
`;
}

/**
 * 主流程
 */
async function main() {
  const { frames: framesDir, audio: audioDir, out: outDir, brief: briefPath } = parseArgs();

  // 读取帧信息
  const framesInfoPath = path.join(framesDir, 'frames.json');
  if (!fs.existsSync(framesInfoPath)) {
    console.error('错误: 找不到 frames.json，请先运行 render.js');
    process.exit(1);
  }
  const frameInfo = JSON.parse(fs.readFileSync(framesInfoPath, 'utf-8'));

  // 读取 TTS 元数据
  const ttsMetaPath = path.join(audioDir, 'tts_metadata.json');
  let sentenceInfo = [];
  let fullAudio = '';
  if (fs.existsSync(ttsMetaPath)) {
    const ttsMeta = JSON.parse(fs.readFileSync(ttsMetaPath, 'utf-8'));
    sentenceInfo = ttsMeta.sentences || [];
    fullAudio = ttsMeta.full_audio;
  }

  // 读取简报
  let brief = {};
  if (briefPath && fs.existsSync(briefPath)) {
    brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  }

  // 根据 TTS 时长更新新闻帧的停留时长
  // 简单策略：每帧时长 = 对应旁白句总时长 + 1.5s 余量
  const newsFrames = frameInfo.filter(f => f.type === 'news');
  const sentencesPerFrame = Math.ceil(sentenceInfo.length / Math.max(newsFrames.length, 1));

  for (let i = 0; i < newsFrames.length; i++) {
    const startIdx = i * sentencesPerFrame;
    const endIdx = Math.min(startIdx + sentencesPerFrame, sentenceInfo.length);
    const frameSentences = sentenceInfo.slice(startIdx, endIdx);
    const speechDuration = frameSentences.reduce((sum, s) => sum + s.duration, 0);
    newsFrames[i].duration = Math.max(speechDuration + 1.5, 3.5); // 最少 3.5 秒
  }

  // 创建输出目录
  fs.mkdirSync(outDir, { recursive: true });
  const clipsDir = path.join(outDir, 'clips');
  const subsFile = path.join(outDir, 'subtitles.ass');
  const silentVideo = path.join(outDir, 'silent.mp4');
  const outputVideo = path.join(outDir, 'daily-news.mp4');

  // 1. 生成每帧的视频片段
  console.log('\n=== 步骤 1: 生成帧片段 ===');
  const clipFiles = generateFrameClips(frameInfo, framesDir, clipsDir);

  // 2. 拼接所有片段
  console.log('\n=== 步骤 2: 拼接视频片段 ===');
  const concatFile = path.join(outDir, 'concat.txt');
  // concat demuxer 的路径是相对于 concat 文件所在目录的
  fs.writeFileSync(concatFile, clipFiles.map(f => `file '${path.resolve(f)}'`).join('\n'));

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -r ${FPS} "${silentVideo}"`,
    { stdio: 'pipe' }
  );
  console.log(`无声视频: ${silentVideo}`);

  // 3. 生成字幕
  console.log('\n=== 步骤 3: 生成字幕 ===');
  const assContent = generateAssSubtitles(sentenceInfo, frameInfo, brief);
  fs.writeFileSync(subsFile, assContent, 'utf-8');
  console.log(`字幕文件: ${subsFile}`);

  // 4. 合成最终视频（音频 + 字幕烧录）
  console.log('\n=== 步骤 4: 合成最终视频 ===');

  if (fullAudio && fs.existsSync(fullAudio)) {
    // 有旁白音频：视频 + 音频 + 字幕
    // 注意：音频长度和视频长度可能不一致，以视频为准
    execSync(
      `ffmpeg -y -i "${silentVideo}" -i "${fullAudio}" ` +
      `-vf "ass='${subsFile.replace(/\\/g, '/')}'" ` +
      `-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -r ${FPS} ` +
      `-c:a aac -b:a 128k -shortest ` +
      `"${outputVideo}"`,
      { stdio: 'pipe' }
    );
  } else {
    // 无音频：只有视频 + 字幕
    execSync(
      `ffmpeg -y -i "${silentVideo}" ` +
      `-vf "ass='${subsFile.replace(/\\/g, '/')}'" ` +
      `-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -r ${FPS} ` +
      `"${outputVideo}"`,
      { stdio: 'pipe' }
    );
  }

  console.log(`\n✅ 合成完成: ${outputVideo}`);

  // 5. 提取关键帧（片头、中间 2 条新闻、片尾）
  console.log('\n=== 步骤 5: 提取关键帧 ===');
  const keyframesDir = path.join(outDir, 'keyframes');
  fs.mkdirSync(keyframesDir, { recursive: true });

  const keyIndices = [0, Math.floor(frameInfo.length / 3), Math.floor(frameInfo.length * 2 / 3), frameInfo.length - 1];
  for (let i = 0; i < keyIndices.length; i++) {
    const idx = keyIndices[i];
    const srcFrame = path.join(framesDir, `frame_${String(frameInfo[idx]?.index || 0).padStart(4, '0')}.png`);
    const destFrame = path.join(keyframesDir, `keyframe_${i + 1}.png`);
    if (fs.existsSync(srcFrame)) {
      fs.copyFileSync(srcFrame, destFrame);
      console.log(`  关键帧 ${i + 1}: frame_${idx}`);
    }
  }

  // 输出视频信息
  try {
    const probeResult = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputVideo}"`,
      { encoding: 'utf-8' }
    );
    console.log(`\n📊 视频时长: ${parseFloat(probeResult).toFixed(1)} 秒`);
  } catch (e) {}

  console.log(`\n🎉 全部完成！输出目录: ${outDir}/`);
}

main().catch(err => {
  console.error('视频合成失败:', err.message);
  process.exit(1);
});
