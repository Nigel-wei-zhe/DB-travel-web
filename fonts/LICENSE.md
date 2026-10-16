# 字型來源與授權

`NotoSansTC-subset.woff2`、`NotoSerifTC-subset.woff2` 是從下列開源字型裁切出的子集（只保留網站用到的字，並限縮字重範圍），依 SIL Open Font License 1.1 授權隨附。

| 檔案 | 原字型 | 來源 | 授權全文 |
| --- | --- | --- | --- |
| `NotoSansTC-subset.woff2`（字重 400–700） | Noto Sans TC（可變字型） | https://github.com/google/fonts/tree/main/ofl/notosanstc | `OFL-NotoSansTC.txt` |
| `NotoSerifTC-subset.woff2`（字重 500–700） | Noto Serif TC（可變字型） | https://github.com/google/fonts/tree/main/ofl/notoseriftc | `OFL-NotoSerifTC.txt` |

- 版權聲明：Noto Sans TC 為 Copyright 2014-2021 Adobe；Noto Serif TC 為 Copyright 2012 Google Inc.，詳見各授權檔。
- 子集是修改版。Noto Sans TC 的保留字型名稱為 "Source"（見授權檔），本專案不使用該名稱；字型不單獨販售。
- `subset-chars.txt`：子集收錄的字元清單，由 `tools/subset-font.py` 產生，`tools/check-font.cjs` 用它檢查缺字。
- 原始字型檔（約 29 MB）放在 `tools/.font-src/`，不進 repo。重新產生：`python3 tools/subset-font.py`（需 `pip install fonttools brotli`），腳本會自動下載原始檔。
