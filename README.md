# TP動画台本メーカー

オプトイン直後のワンタイムオファー、またはLINEステップからアクセスする「無料セミナー募集ページ（TP）」用の動画台本を作るWebアプリです。

## 主な機能

- TP用の冒頭30秒フック100パターン生成
- 自作フック入力
- セミナー募集ページ用の動画台本生成
- Bロール/スライド指示
- 100点満点の採点
- 改善指示に基づく再生成

## ローカル起動

```powershell
npm start
```

URL:

```text
http://localhost:8791/
```

## OpenAI APIキー

どちらかで設定できます。

- 画面上部のOpenAI APIキー欄に一時入力する
- Renderなどの環境変数 `OPENAI_API_KEY` に設定する

Render公開時は環境変数で設定してください。

## Render公開

`render.yaml` を使ってRenderにデプロイできます。

環境変数:

- `OPENAI_API_KEY`: 必須
- `OPENAI_MODEL`: 任意。初期値は `gpt-4.1`
