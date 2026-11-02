# AI 资讯早报 · 自动化生成工具

每天自动采集 AI 行业资讯，生成文字简报 + 60-90 秒讲解视频。

> 瑞士风版式 · 纸白底 · 安全橙 #FF6B35 · 1920×1080 横屏

## 快速开始

### 方式一：只用提示词（零依赖）

打开 [`PROMPT.md`](./PROMPT.md)，复制全文到任意 Agent（Claude、GPT、豆包等），它就能帮你完成资讯采集和文字简报。

> 没有渲染环境也没关系——至少能拿到 5-7 条精选 AI 新闻 + 来源链接。

### 方式二：完整出片（需要本仓库代码）

```bash
# 克隆仓库
git clone <your-repo-url>
cd ai-daily-news

# 安装依赖
npm install
pip install -r requirements.txt

# 安装 Playwright 浏览器（如果系统没有 Chromium）
npx playwright install chromium

# 用示例数据试跑
node src/main.js --brief examples/sample-brief.json --output output/

# 输出在 output/ 目录：
#   - daily-news.mp4    成片
#   - narration_full.mp3  旁白音频
#   - keyframes/        4 张关键帧截图
#   - frames/           所有帧截图
```

## 目录结构

```
ai-daily-news/
├── PROMPT.md              # 完整提示词（复制即用，核心交付物）
├── README.md              # 本文件
├── SKILL.md               # Skill 定义（用于 aily / Claude Skills）
├── package.json           # Node 依赖
├── requirements.txt       # Python 依赖
├── .gitignore
├── LICENSE
├── src/
│   ├── main.js            # 主入口：编排整个流程
│   ├── render.js          # Playwright 渲染：HTML → 帧截图
│   ├── video.js           # FFmpeg 合成：帧 + 音频 + 字幕 → mp4
│   └── tts.py             # TTS 配音：edge-tts 逐句合成（失败自动降级静音）
├── templates/
│   └── slide.html         # HTML 版式模板（瑞士风，可自定义配色）
├── examples/
│   ├── sample-brief.json  # 完整示例（5 条新闻）
│   └── short-brief.json   # 简短示例（2 条新闻，用于快速测试）
└── assets/                # 可放背景音乐等资源
```

## 输入格式

`brief.json` 结构：

```json
{
  "date": "2026-11-01",
  "sourceChannel": "TLDR AI + 机器之心",
  "items": [
    {
      "index": 1,
      "title": "OpenAI 发布 GPT-5",
      "points": ["推理能力显著提升", "API 已开放"],
      "keyNumbers": [
        { "value": "40%", "label": "推理提升" },
        { "value": "$10", "label": "每百万 token" }
      ],
      "sourceName": "OpenAI 官方",
      "sourceUrl": "https://openai.com/..."
    }
  ],
  "narrationScript": "各位好，欢迎收看今天的 AI 早报。\n第一条消息……",
  "unstableNote": "今日 Import AI 未更新"
}
```

**字段说明：**
- `date`: 日期，显示在片头
- `sourceChannel`: 整体采集渠道，显示在右上角
- `items[]`: 新闻条目，5-7 条最佳
  - `keyNumbers`: 关键数字，支持 `{value, label}` 对象或纯字符串
- `narrationScript`: 旁白稿，按句换行
- `unstableNote`: 不稳定说明（可选）

## 依赖

- **Node.js** ≥ 18
- **Playwright** + Chromium（或系统已安装 Chrome / Chromium）
- **FFmpeg**
- **Python** ≥ 3.9
- **edge-tts**（Python 包，免费 TTS，网络受限环境会自动降级为静音占位）

### TTS 备选方案

edge-tts 依赖微软的在线服务，某些网络环境可能不可用。备选：

| 方案 | 优点 | 缺点 |
|------|------|------|
| edge-tts（默认） | 免费、中文音色好、无需 API Key | 需要网络访问微软服务 |
| 本地 TTS（如 Coqui TTS） | 完全离线 | 需下载模型，中文效果一般 |
| 商用 API（阿里云、腾讯云） | 稳定、音色多 | 需付费、需 API Key |
| 静音占位（fallback） | 不依赖任何服务 | 只有画面没有声音 |

切换 TTS 方案：修改 `src/tts.py` 中的 `synthesize_sentence` 函数即可。

## 自定义

### 改配色

编辑 `templates/slide.html` 顶部的 CSS 变量：

```css
:root {
  --accent: #FF6B35;    /* 主色调（安全橙）*/
  --paper: #FAF9F7;     /* 背景色（纸白）*/
  --ink: #1A1A1A;       /* 主文字色 */
}
```

### 改音色

```bash
python3 src/tts.py --brief brief.json --out audio/ --voice zh-CN-YunxiNeural
```

edge-tts 支持的中文音色：`zh-CN-XiaoxiaoNeural`（女声，默认）、`zh-CN-YunxiNeural`（男声）、`zh-CN-XiaoyiNeural`（女童声）等。

### 改视频质量

编辑 `src/video.js` 中的编码参数：
- `-preset`: `ultrafast`（最快）→ `fast` → `medium` → `slow`（最慢质量最好）
- `-crf`: 数值越小质量越高（28=较快，23=默认，18=接近无损）

## 工作原理

1. **渲染**：用 HTML/CSS 做版式，Playwright 逐屏截图 → PNG 序列
2. **配音**：edge-tts 逐句合成中文旁白，记录每句时长（不可用时降级为静音占位）
3. **合成**：FFmpeg 把帧、音频、字幕合成为 mp4，字幕烧录到画面
4. **对齐**：每屏停留时长 = 对应旁白句的时长 + 余量

## 常见问题

**Q: 只有提示词能出视频吗？**
A: 不能。提示词指导 Agent 完成"采集 + 写稿"，视频渲染需要本仓库的代码和运行环境。但只有提示词也能拿到文字简报。

**Q: edge-tts 连接失败怎么办？**
A: 脚本会自动降级为静音占位音频，视频仍能生成（只是没有声音）。换个网络环境，或改用其他 TTS 方案。

**Q: 可以做竖屏（9:16）吗？**
A: 可以。修改 `templates/slide.html` 的 viewport 尺寸和 CSS 布局即可。当前只优化了横屏 1920×1080。

**Q: 渲染很慢怎么办？**
A: 1 核机器上渲染 90 秒视频可能需要 5-10 分钟。可以：① 减少新闻条数；② 用 `-preset ultrafast`（已默认开启）；③ 降低分辨率。

## License

MIT
