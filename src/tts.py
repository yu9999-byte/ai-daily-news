#!/usr/bin/env python3
"""
tts.py - TTS 配音脚本
使用 edge-tts 逐句合成中文旁白，输出音频文件和每句时长信息
如果 edge-tts 不可用（网络限制等），自动降级为生成静音占位音频

用法: python3 src/tts.py --brief brief.json --out audio/
"""

import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

HAS_EDGE_TTS = False
try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    pass

# 中文音色（可按需更换）
VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+0%"      # 语速
VOLUME = "+0%"    # 音量

# 每字预估时长（秒），用于 fallback 模式下估算静音时长
EST_SECONDS_PER_CHAR = 0.22


def get_audio_duration(filepath: str) -> float:
    """获取音频时长（秒），使用 ffprobe"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", filepath],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def split_sentences(text: str) -> list:
    """
    将旁白稿按句子拆分，用于逐句合成和字幕对齐
    按句号、问号、感叹号、换行拆分
    """
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    sentences = []
    for line in lines:
        parts = re.split(r'([。！？!?])', line)
        i = 0
        while i < len(parts):
            if parts[i].strip():
                if i + 1 < len(parts) and parts[i + 1] in '。！？!?':
                    sentences.append(parts[i].strip() + parts[i + 1])
                    i += 2
                else:
                    sentences.append(parts[i].strip())
                    i += 1
            else:
                i += 1
    return [s for s in sentences if s]


def generate_silence(duration: float, output_path: str) -> float:
    """生成指定时长的静音音频（fallback）"""
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r=24000:cl=mono",
             "-t", str(duration), "-c:a", "libmp3lame", "-b:a", "128k", output_path],
            capture_output=True, timeout=10
        )
        return duration
    except Exception:
        return 0.0


async def synthesize_sentence(text: str, output_path: str, voice: str = VOICE) -> tuple:
    """
    合成单句音频，返回 (duration, source)
    source: 'edge-tts' 或 'silence-fallback'
    """
    if HAS_EDGE_TTS:
        try:
            communicate = edge_tts.Communicate(text, voice, rate=RATE, volume=VOLUME)
            await communicate.save(output_path)
            duration = get_audio_duration(output_path)
            if duration > 0:
                return duration, 'edge-tts'
        except Exception as e:
            print(f"  edge-tts 失败: {str(e)[:60]}")

    # Fallback: 生成静音占位
    est_duration = max(len(text) * EST_SECONDS_PER_CHAR, 1.0)
    generate_silence(est_duration, output_path)
    return est_duration, 'silence-fallback'


async def main():
    parser = argparse.ArgumentParser(description="AI 早报 TTS 配音")
    parser.add_argument("--brief", required=True, help="简报 JSON 文件路径")
    parser.add_argument("--out", default="audio", help="输出目录")
    parser.add_argument("--voice", default=VOICE, help="TTS 音色")
    parser.add_argument("--force-silence", action="store_true",
                        help="强制使用静音占位（用于测试）")
    args = parser.parse_args()

    # 读取简报
    with open(args.brief, 'r', encoding='utf-8') as f:
        brief = json.load(f)

    narration = brief.get("narrationScript", "")
    if not narration:
        print("错误: 简报中没有 narrationScript（旁白稿）", file=sys.stderr)
        sys.exit(1)

    # 创建输出目录
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 拆分句子
    sentences = split_sentences(narration)
    print(f"旁白共 {len(sentences)} 句")

    # 检查 TTS 可用性
    if args.force_silence:
        print("⚠️  强制使用静音占位模式")
        tts_source = 'silence-fallback'
    elif HAS_EDGE_TTS:
        print(f"使用 edge-tts，音色: {args.voice}")
        tts_source = 'edge-tts'
    else:
        print("⚠️  edge-tts 未安装，使用静音占位模式")
        print("   安装命令: pip install edge-tts")
        tts_source = 'silence-fallback'

    # 逐句合成
    sentence_info = []
    total_duration = 0.0
    fallback_count = 0

    for i, sentence in enumerate(sentences):
        audio_path = out_dir / f"sentence_{i:03d}.mp3"
        print(f"合成第 {i+1}/{len(sentences)} 句: {sentence[:20]}...")

        if args.force_silence:
            est_duration = max(len(sentence) * EST_SECONDS_PER_CHAR, 1.0)
            generate_silence(est_duration, str(audio_path))
            duration = est_duration
            source = 'silence-fallback'
        else:
            duration, source = await synthesize_sentence(sentence, str(audio_path), args.voice)

        if source == 'silence-fallback':
            fallback_count += 1

        sentence_info.append({
            "index": i,
            "text": sentence,
            "audio_file": str(audio_path),
            "duration": round(duration, 3),
            "source": source
        })
        total_duration += duration

    # 合并所有音频为完整旁白
    concat_file = out_dir / "concat.txt"
    with open(concat_file, 'w', encoding='utf-8') as f:
        for info in sentence_info:
            if info["duration"] > 0:
                f.write(f"file '{info['audio_file']}'\n")

    full_audio = out_dir / "narration_full.mp3"
    print(f"\n合并旁白音频 → {full_audio.name}")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(concat_file), "-c", "copy", str(full_audio)],
        capture_output=True
    )

    # 输出元数据
    metadata = {
        "voice": args.voice,
        "tts_source": tts_source if fallback_count == 0 else "mixed",
        "fallback_count": fallback_count,
        "total_sentences": len(sentences),
        "total_duration": round(total_duration, 3),
        "full_audio": str(full_audio),
        "sentences": sentence_info
    }

    meta_path = out_dir / "tts_metadata.json"
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\n合成完成！")
    print(f"  总句数: {len(sentences)}")
    print(f"  总时长: {total_duration:.1f} 秒")
    if fallback_count > 0:
        print(f"  ⚠️  {fallback_count} 句使用了静音占位（TTS 不可用）")
        print(f"     正式使用请确保网络可访问 edge-tts 服务")
    print(f"  完整音频: {full_audio}")
    print(f"  元数据: {meta_path}")


if __name__ == "__main__":
    asyncio.run(main())
