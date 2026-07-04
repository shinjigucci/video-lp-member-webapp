# URLで使える会員限定アプリにする手順

## 推奨構成

おすすめは、Node.js対応サーバーにこのアプリを置き、WordPressの会員ページからリンクする形です。

例:

```text
https://app.adlabo.biz/video-lp-maker
```

## 必要な設定

サーバー側で次の環境変数を設定します。

```text
OPENAI_API_KEY=あなたのOpenAI APIキー
MEMBER_ACCESS_CODE=受講生に渡すアクセスコード
OPENAI_MODEL=gpt-4.1
```

この設定にすると、受講生はAPIキーを入力せず、アクセスコードだけでアプリを使えます。

## Renderで公開する場合

1. GitHubにこのフォルダをアップロード
2. Renderで「New Web Service」を作成
3. Build Commandは空欄または `npm install`
4. Start Commandは `npm start`
5. Environment Variablesに以下を設定
   - `OPENAI_API_KEY`
   - `MEMBER_ACCESS_CODE`
   - `OPENAI_MODEL`
6. 発行されたURLを受講生に案内

## Railwayで公開する場合

1. Railwayで新規プロジェクト作成
2. このフォルダをGitHub経由で接続
3. Variablesに以下を設定
   - `OPENAI_API_KEY`
   - `MEMBER_ACCESS_CODE`
   - `OPENAI_MODEL`
4. Deploy
5. Public URLを発行

## WordPress会員ページに置く場合

WordPress固定ページにアプリを直接貼るのではなく、次のように案内します。

```text
10分動画LP台本メーカー完全版はこちら
https://app.adlabo.biz/video-lp-maker

アクセスコード:
受講生専用コード
```

## 受講生への案内文

```text
10分動画LP台本メーカー完全版を公開しました。

下記URLからアクセスしてください。
URL: https://app.adlabo.biz/video-lp-maker
アクセスコード: 受講生専用コード

商品情報またはLP画像を入れると、
冒頭30秒フック100案、10分動画LP台本、AIアバター用原稿、
50〜60枚のスライド構成、各スライド画像生成プロンプトまで出力できます。
```
