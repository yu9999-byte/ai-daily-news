---
name: ai-daily-news
description: 自动采集 AI 行业资讯，生成文字简报 + 60-90 秒讲解视频。瑞士风版式，1920×1080 横屏，中文旁白+字幕。Use when the user asks for AI 早报、AI 资讯日报、AI news video、每日 AI 新闻、AI 资讯视频。
---

# AI 资讯早报 Skill

每天自动采集 AI 行业资讯，生成文字简报 + 讲解视频。

先读取同目录的 `AGENTS.md`，按其中流程执行；安装和现有程序限制见 `README.md`，采编标准见 `PROMPT.md`。采集依赖 Agent 自身的联网工具，视频依赖本地终端能力。仓库 URL 不会自动安装 Skill，各 Agent 应按自身规范加载；不支持 Skill 时直接读取上述文档。

## 触发场景

- "做一期 AI 早报"
- "今天 AI 圈有什么新闻"
- "生成 AI 资讯视频"
- "AI 日报"

## 能力范围

### 能做的

- 多来源资讯采集（英文 newsletter + 中文媒体 + 官方公告）
- 5-7 条精选主线，每条附来源链接
- 1920×1080 横屏视频，60-90 秒
- 瑞士风版式（纸白底 + 安全橙 #FF6B35）
- 中文旁白（edge-tts）+ 逐句字幕
- 关键帧截图

### 不能做的

- 实时直播流
- 竖屏短视频（9:16）—— 可以做但版式未优化
- 多语言配音 —— 目前只有中文
- 需要登录的付费内容源

## 环境要求

首次使用前检查：

```bash
node --version    # ≥ 18
ffmpeg -version   # 已安装
python3 --version # ≥ 3.9
pip show edge-tts # 已安装
npx playwright --version # 已安装
```

缺失的按 README 安装。

## 工作流程

1. **采集资讯** → 生成 `brief.json`
2. **渲染帧** → `node src/render.js --brief brief.json --out frames/`
3. **合成配音** → `python3 src/tts.py --brief brief.json --out audio/`
4. **合成视频** → `node src/video.js --frames frames/ --audio audio/ --out output/`
5. **交付检查** → 从最终 MP4 抽帧并试听；现有 keyframes 是原图副本。记录静音降级、音画错位等问题，按授权范围处理。

## 输入输出

### 输入

- 日期（默认昨天）
- 可选：指定来源、指定条数

### 输出

- `daily-news.mp4` — 成片
- `brief.json` — 文字简报数据
- `narration.txt` — 旁白稿，由 Agent 从 narrationScript 单独保存
- `keyframes/` — 3-4 张关键帧

## 质量标准

- 数字、引用、链接必须可溯源
- 文字不溢出、不重叠、不截断
- 中文不缺字
- 音画对齐（误差 ≤ 0.1s 为目标，当前代码不保证，需验收）
- 色调统一（安全橙 #FF6B35）
