# インパクト型10分動画LP台本メーカー

広告・SNSからLINE登録やセミナー申込につなげる10分動画LP台本を作成し、100点満点で採点、改善案まで出力するWebアプリです。

## ローカル起動

```powershell
npm start
```

URL:

```text
http://localhost:8790/
```

## APIキー

どちらかで設定できます。

- 画面上部のOpenAI APIキー欄に入力
- Renderなどの環境変数 `OPENAI_API_KEY` に設定

## Render公開

`render.yaml` を使ってRenderにデプロイできます。

環境変数:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional, default `gpt-4.1`

## 出力内容

- 台本の狙い
- 完成台本
- 100点満点の採点表
- 改善ポイント
- 90点未満の場合の改善版台本
