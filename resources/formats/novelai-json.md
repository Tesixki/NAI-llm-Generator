---
name: NovelAI JSON (標準)
description: NAI-json-to-gen 互換のリクエスト JSON。単一 / requests バッチ、キャラクター配置、参照画像に対応
---

# 出力フォーマット: NovelAI JSON

出力は以下の仕様に従う **1 つの JSON オブジェクト**。`_` で始まるキーはコメントとして無視される (`requests[].` 内の `_name` だけは出力ファイル名として使われる)。

## 単一リクエスト

```json
{
  "_comment": "任意のメモ",
  "prompt": "1girl, solo, ...",
  "negative_prompt": "",
  "model": "nai-diffusion-4-5-full",
  "size": "portrait",
  "steps": 23,
  "scale": 5.0,
  "sampler": "k_euler_ancestral",
  "noise_schedule": "karras",
  "seed": 0,
  "n_samples": 1,
  "quality": true,
  "uc_preset": "light",
  "cfg_rescale": 0.0,
  "variety_boost": false,
  "characters": [
    { "prompt": "arona_(blue_archive), blue_archive, ...", "negative_prompt": "", "position": "C3", "enabled": true }
  ]
}
```

## パラメータ

| キー | 型 | デフォルト | 説明 |
|---|---|---|---|
| `prompt` | string | **必須** | ベースプロンプト (Danbooru タグ列、英語) |
| `negative_prompt` | string | `""` | ネガティブ。UC プリセットと結合される |
| `model` | string | `nai-diffusion-4-5-full` | `nai-diffusion-4-5-full` / `nai-diffusion-4-5-curated` / `nai-diffusion-4-full` / `nai-diffusion-4-curated` / `nai-diffusion-3` |
| `size` | string \| [w,h] | `portrait` | `portrait`(832×1216) / `landscape`(1216×832) / `square`(1024×1024) / `large_portrait`(1024×1536) / `large_landscape`(1536×1024) または `[幅, 高さ]` (64 の倍数) |
| `steps` | int | 23 | 1〜50。推奨 23〜28 |
| `scale` | float | 5.0 | CFG。3〜5 柔軟、6〜10 厳密 |
| `sampler` | string | `k_euler_ancestral` | `k_euler` / `k_euler_ancestral` / `k_dpmpp_2m` / `k_dpmpp_2s_ancestral` / `k_dpmpp_sde` / `ddim` |
| `noise_schedule` | string | `karras` | `karras` / `exponential` / `polyexponential` |
| `seed` | int | 0 | 0 = ランダム |
| `n_samples` | int | 1 | 1〜8 |
| `quality` | bool | true | 品質タグ自動付与 |
| `uc_preset` | string | `light` | `strong` / `light` / `human_focus` / `furry_focus` / `none` |
| `cfg_rescale` | float | 0.0 | 0.0〜1.0 |
| `variety_boost` | bool | false | 多様性ブースト |

## キャラクター配置 (`characters`, V4/V4.5)

複数人のとき、各キャラクターを個別に記述する。`prompt` 内の人数タグ (`2girls` など) と要素数を一致させる。

| フィールド | 型 | 説明 |
|---|---|---|
| `prompt` | string | キャラクター固有タグ (名前, 版権, 画角, 外見, 服装, 行動) |
| `negative_prompt` | string | 任意 |
| `position` | `"A1"`〜`"E5"` または `[x, y]` (0.0〜1.0) | 省略時は中央 `C3`。列 A〜E が左→右、行 1〜5 が上→下。横長なら左右 (`B3`, `D3`)、縦長なら上下に分ける |
| `enabled` | bool | 省略時 true |

## 参照画像 (指示にファイルパスがある場合のみ)

```json
{
  "character_references": [{ "image": "C:/refs/chara.png", "type": "character", "fidelity": 0.75, "strength": 1.0 }],
  "controlnet": { "images": [{ "image": "C:/refs/style.naiv4vibe", "info_extracted": 0.7, "strength": 0.6 }], "strength": 1.0 },
  "i2i": { "image": "C:/refs/base.png", "strength": 0.6, "noise": 0.0 }
}
```

- `character_references[].type`: `character` / `style` / `character&style` (V4.5 専用)
- `controlnet.images[].image`: 画像パス または `.naiv4vibe` ファイル
- `i2i.strength`: 0.1〜0.3 微調整、0.4〜0.6 スタイル変更、0.7〜0.9 大幅変更

## バッチ (複数パターン)

`requests` 配列を使う。トップレベルのキーが全リクエストのデフォルトになり、各要素で上書きできる。

```json
{
  "model": "nai-diffusion-4-5-full",
  "size": "portrait",
  "quality": true,
  "uc_preset": "light",
  "requests": [
    { "_name": "arona_classroom_night", "prompt": "...", "characters": [{ "prompt": "..." }] },
    { "_name": "arona_rooftop_sunset", "prompt": "...", "size": "landscape" }
  ]
}
```

- `_name` は英数字とアンダースコアのみ (出力ファイル名になる)。
- ユーザーが「N パターン」「バリエーション」を求めたら必ずこの形式にする。
