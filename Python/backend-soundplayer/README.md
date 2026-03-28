# Python関連のREADME集

## プログラムの起動方法（uv）

### uvについて

uvとはPythonの仮想環境のパッケージ管理アプリである。
このプログラムはuvでパッケージの管理をしているので、uvを推奨する。
モジュール関連のバグはだいたいここらへんのせいです。

### uvのインストール

Pythonはインストールされているものとする。

```sh
pip install uv
```

### uvで実行する前にやること

```sh
uv sync
```

これで依存関係をインストールする。

### uvの実行

Code Runnerを使う場合はこのままボタンから実行可能。

ターミナルで実行する場合は

```sh
uv run python [実行するファイル名]
```

で実行する。

### その他

詳しいことは[こちら](https://zenn.dev/nobkat/articles/004uv-package-management-tool)

## TestFSK.py

### waveファイルの生成手順

波の情報を持った配列を、wavファイルを生成するwaveモジュールに渡す。

### 波の切り替え

信号によってsin波の振動数の値を変える。

## TestPSK.py

### 波の切り替え

信号によってsin波の変位に-1をかける。
