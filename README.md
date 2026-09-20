# NAI LLM Generator

LLM (Claude API / OpenAI 互換 API / Claude Code CLI / Devin CLI) に **スキル (プロンプト規約)** と **出力フォーマット** を読み込ませ、
**Danbooru MCP** でタグを検証しながら NovelAI 用の生成 JSON を作らせ、そのまま **NovelAI API** で画像を生成する Electron デスクトップアプリです。

```
指示 (日本語)
   │  + スキル .md (プロンプト規約 / 調査手順)
   │  + フォーマット .md (JSON 仕様)
   ▼
LLM エージェント ──▶ MCP ツール呼び出し (内蔵 danbooru: search_tags / get_wiki_info / get_character_tags / get_post_tags, novelai-mcp ...)
   │
   ▼
生成 JSON (NAI-json-to-gen 互換) ──▶ NovelAI /ai/generate-image ──▶ 画像 + JSON を出力フォルダに保存
```

## 機能

- **4 種類の LLM バックエンド**
  - Claude API (`@anthropic-ai/sdk`、tool use でアプリ内から MCP を呼ぶ)
  - OpenAI 互換 API (OpenAI / OpenRouter / LM Studio / Ollama / vLLM。function calling で MCP を呼ぶ)
  - Claude Code CLI (`claude -p --mcp-config ...` を非対話実行。MCP 設定は自動で渡す)
  - Devin CLI (`devin --print --prompt-file ...`。MCP 設定は一時ワークスペースの `.devin/mcp_config.json` に自動生成)
- **MCP クライアント内蔵**: `mcpServers` 形式 (Claude Desktop と同じ) で stdio / Streamable HTTP サーバーを登録。内蔵の Danbooru ツールサーバーをデフォルトで有効化、`@gamzadongza/danbooru-tags-mcp` (Smithery) と `syou6162/novelai-mcp` を無効状態で同梱。
- **スキル / フォーマット**: `skills/*.md` (または `skills/<name>/SKILL.md`) と `formats/*.md` をチェックボックスで選択してシステムプロンプトに注入。
- **NovelAI 生成器内蔵**: V4 / V4.5 のキャラクター配置 (`characters` + `position`)、キャラクターリファレンス、Vibe Transfer (`.naiv4vibe` の埋め込みエンコード再利用)、img2img / inpaint、`requests` バッチ、UC プリセット、品質タグ。
- **JSON エディタ**: LLM が出した JSON を手で直して再生成、ファイルの開閉、「JSON を修正」で LLM に差分修正させる。
- **ギャラリー / 履歴**: 生成画像と使用 JSON を保存し、あとから JSON を読み戻せる。
- API キーは Electron `safeStorage` で暗号化して保存。

## セットアップ

```bash
npm install
npm run dev        # 開発起動
npm run build      # out/ にビルド
npm run dist:win   # Windows インストーラ / portable (release/)
```

必要なもの:

- Node.js 20+ (MCP サーバーを `npx` で起動するため)
- NovelAI の Persistent API Token (`pst-...`)
- いずれかの LLM: Anthropic API キー / OpenAI 互換エンドポイント / `claude` CLI / `devin` CLI
- (任意) `uv` — 同梱の NovelAI MCP を有効化する場合
- Devin CLI を使う場合: PowerShell で `irm https://static.devin.ai/cli/setup.ps1 | iex` → `devin login`

初回起動後 `⚙ 設定` から API キーと出力フォルダを設定してください。

## 使い方

1. 左ペインに日本語で指示を書く (例: 「ブルアカのアロナを夜の教室で。3 パターン」)。
2. 使うスキルにチェック、フォーマットを選ぶ。
3. `▶ JSON 作成 → 画像生成` を押す。ログにツール呼び出しの経過が流れ、JSON タブに結果が入る。
4. 自動生成をオフにしている場合は JSON を確認・編集して `▶ この JSON で生成`。

出力: `<出力フォルダ>/<yyyymmdd_hhmmss>/<name>.png` と同名の `.json` (使用した seed を含む)。

## スキル / フォーマットの追加

`設定 → フォルダ` のパス (既定は `%APPDATA%/nai-llm-generator/skills`, `formats`) に Markdown を置くだけです。

```markdown
---
name: 表示名
description: 一覧に出る説明
---
本文 (そのままシステムプロンプトに入ります)
```

- **スキル**: プロンプトの書き方、タグ知識、作品ごとのキャラクター表、NG 事項など。複数選択可。
- **フォーマット**: LLM に出させる JSON の仕様。1 つ選択。既定の `NovelAI JSON (標準)` は [NAI-json-to-gen](https://github.com/Tesixki/NAI-json-to-gen) の JSON 仕様と互換です。

## MCP サーバー設定

`設定 → MCP サーバー` の JSON を編集します。

```json
{
  "danbooru": { "type": "builtin", "enabled": true },
  "danbooru-tags-smithery": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@smithery/cli@latest", "run", "@gamzadongza/danbooru-tags-mcp"],
    "enabled": false
  },
  "novelai": {
    "type": "stdio",
    "command": "uv",
    "args": ["run", "--from", "git+https://github.com/syou6162/novelai-mcp", "novelai-mcp"],
    "env": { "NOVELAI_API_KEY": "${NOVELAI_API_KEY}", "NOVELAI_OUTPUT_DIR": "${OUTPUT_DIR}" },
    "enabled": false
  },
  "remote-example": { "type": "http", "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer ..." } }
}
```

`${NOVELAI_API_KEY}` `${OUTPUT_DIR}` `${ANTHROPIC_API_KEY}` `${OPENAI_API_KEY}` は設定値に置換されます。
ツール名は LLM には `<server>__<tool>` (Claude Code CLI では `mcp__<server>__<tool>`) として見えます。

`"type": "builtin"` の `danbooru` はアプリ内蔵の Danbooru ツール (`search_tags` / `get_wiki_info` / `get_character_tags` / `get_post_tags` / `get_post_count`) で、
danbooru.donmai.us をこの PC から直接呼びます (Smithery 等のホスト型 MCP は Danbooru 側に 403 で弾かれるため)。CLI バックエンドには `out/main/danbooru-mcp-stdio.js` を `ELECTRON_RUN_AS_NODE=1` の Electron で起動する stdio サーバーとして渡されます。

## LLM バックエンドごとの注意

| バックエンド | MCP の呼び方 | 備考 |
|---|---|---|
| Claude API | アプリが tool use を仲介 | `submit_request` ツールで JSON を受け取る |
| OpenAI 互換 | アプリが function calling を仲介 | tools 非対応サーバーでは本文の ```json ブロックから抽出 |
| Claude Code CLI | CLI が直接 MCP を起動 | `--mcp-config` に一時ファイルを渡す。Bash/Edit/Write は禁止して実行 |
| Devin CLI | 一時ワークスペースの `.devin/mcp_config.json` を自動生成 | `--permission-mode dangerous` で実行 (print モードは承認プロンプトを出せないため)。回答末尾の ```json ブロックから抽出。事前に `devin login` |

## 構成

```
src/main/            Electron main
  config.ts          設定の読み書き (safeStorage で秘密情報を暗号化)
  skills.ts          skills / formats の列挙・frontmatter 解析
  mcp/manager.ts     MCP クライアント (stdio / HTTP)、ツール一覧・呼び出し
  llm/agent.ts       システムプロンプト構築とプロバイダ実行
  llm/anthropic.ts   Claude API tool-use ループ
  llm/openai.ts      OpenAI 互換 function-calling ループ
  llm/cli.ts         claude / devin CLI 実行
  novelai/convert.ts JSON → NovelAI API ペイロード変換
  novelai/client.ts  generate-image / encode-vibe
  novelai/generate.ts バッチ展開・保存
src/preload/         contextBridge API
src/renderer/        React UI
resources/skills     同梱スキル (初回起動時にユーザーフォルダへコピー)
resources/formats    同梱フォーマット
```

## License

MIT
