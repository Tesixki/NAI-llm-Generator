---
name: NovelAI JSON (ミニマル)
description: prompt / characters / size だけの最小構成。素早く試したいとき用
---

# 出力フォーマット: NovelAI JSON (ミニマル)

以下のキーだけを持つ JSON オブジェクトを出力する。その他のパラメータはアプリのデフォルト (V4.5 Full, 23 steps, scale 5.0, light UC) が使われる。

```json
{
  "prompt": "1girl, solo, <artist tags>, <rating>, <background/scene tags>",
  "characters": [
    { "prompt": "<character tag>, <copyright tag>, <framing>, <appearance>, <outfit>, <action>", "position": "C3" }
  ],
  "size": "portrait",
  "n_samples": 1
}
```

- `size`: `portrait` / `landscape` / `square`
- `n_samples`: 1〜4
- 複数パターンなら `{"requests": [ {...}, {...} ]}` の形にし、各要素に `_name` を付ける。
