# 旅日手帖

手機優先的旅行網站首頁原型，使用 HTML、CSS 與原生 JavaScript。

開發前請閱讀 [開發規範](AGENTS.md)；修改畫面前另讀 [視覺與操作規範](DESIGN.md)。規範沿用 FUKUOKA 的開發與長輩友善原則，並依本專案的 JSONL 與分檔結構調整。

## 本地預覽

執行 `node dev-server.cjs`，開啟 http://127.0.0.1:5173 。無須安裝套件。

## GitHub Pages

網站網址：[旅日手帖](https://nigel-wei-zhe.github.io/DB-travel-web/)。儲存庫已公開，發布來源為 `dev` 分支根目錄；push 到 `origin/dev` 後由 GitHub Pages 自動部署，部署完成才會更新網站。

網站入口為根目錄的 `index.html`；資源採相對路徑，適用 GitHub Pages 專案子路徑。導覽使用 hash，不依賴伺服器路由。可將根目錄作為 GitHub Pages 發布來源，不需要建置步驟。`dev-server.cjs` 僅供本機開發。

目前旅行行程為示範資料。每日行程頁已接入 JSONL，包含行前檢查表、日期切換與地圖連結；精選店家使用 `data/shops.jsonl` 定義區域群組及店家類型標籤。優惠頁由 `data/coupons.jsonl` 載入圖片，支援放大與開啟原圖；圖檔放在 `assets/coupons/`。首頁天氣與匯率已使用公開 API。字型使用 `fonts/` 內的 Noto Sans TC／Noto Serif TC 子集，不依賴 Google Fonts。

## 每日行程與行前清單

替換 `data/itinerary.jsonl` 與 `data/checklist.jsonl` 後重新整理即可。欄位與規則詳見 [資料格式](data/FORMAT.md)。檢查表勾選保存在當前裝置，依旅行 ID 分開。首頁目的地、標題、副標題、日期與天氣讀取 trip 設定。目前主視覺為福岡秋日旅行，既有東京行程與虛構店家仍保留為示範，尚未替換為福岡行程。旅行與項目 ID 保留以延用本機紀錄。

若要先在 Google 試算表填寫行程與精選店家，可使用 [中文 CSV 範本與同步說明](templates/README.md)。到 GitHub Actions 手動執行「同步 Google 試算表」：讀取試算表、驗證後把更新推到 `sync-sheet` 預覽分支，不會直接改 `dev`，也不會自動部署。執行結果頁有變動統計與預覽連結，確認後用 `sh tools/merge-dev.sh sync-sheet` 合回。行程或店家一次刪除超過 10 筆，或刪除至少 3 筆且超過既有筆數 20% 時預設拒絕，確認試算表正確再勾選 `allow_delete` 重跑。

驗證：`node --test --test-isolation=none app.test.cjs trip-data.test.cjs maps.test.cjs visits.test.cjs sw.test.cjs`。

## 加入主畫面與離線

- 以 `manifest.webmanifest` 與 `sw.js` 支援加入主畫面。Service Worker 需 HTTPS 或 localhost，不能用 `file://`。
- 離線可用：頁面、樣式、程式、地圖程式庫、行程／清單／店家／優惠資料、優惠券圖片、蓋章圖。HTML 與 `data/` 網路優先（4 秒逾時退回快取），其他本機檔案快取優先；跨網域請求不經快取。
- 字型已內建並由 Service Worker 快取，離線可正常顯示。
- 有限制：天氣、匯率需網路（匯率沿用 localStorage 快取並標示時間）；地圖底圖圖磚需網路，離線只看得到圖釘。因此不宣稱完整離線可用。
- 快取名稱含 `VERSION` 與網站路徑，各 commit 預覽路徑互不影響。改動任何快取資源或新增檔案時，要同步更新 `CORE_FILES` 並遞增 `sw.js` 的 `VERSION`。
- 偵測到新版本時畫面顯示「有新版本」與「更新」，按下才重新載入。

## 首頁資料來源

- 天氣：[Open-Meteo](https://open-meteo.com/en/docs)。讀取 `data/itinerary.jsonl` 的 `trip.destination` 與 `trip.timezone`，未填目的地時使用第一天位置；目前為福岡座標 33.5902, 130.4017，顯示當前模型氣溫、天氣代碼、今日高低溫與全日最高降雨機率。資料不是封面旅行日期的預報。免費服務供非商業用途；頁面附 CC BY 4.0 授權與來源標示。天氣代碼轉中文、溫度取整數。
- 匯率：[Frankfurter v2](https://frankfurter.dev/)，使用 `/v2/rate/JPY/TWD`。提供每日參考匯率，非銀行現鈔或刷卡成交價。假日可能沿用前一筆；換向以同一匯率取倒數。
- 均以瀏覽器直接 HTTPS 請求，不需要金鑰或後端。請求不帶憑證與 referrer；不讀取裝置位置。
- 天氣快取依座標與時區隔離、有效 30 分鐘；匯率快取 6 小時，存於本機 localStorage；重新整理按鈕略過本機快取。API 自身可能仍有快取。請求 12 秒逾時，載入失敗時若有快取則明確標示舊資料，無快取則顯示空值與重試提示，不套用假匯率。禁用本機儲存時仍可正常使用。
- 畫面只顯示台灣時區的刷新時間（成功取得資料的時間，非來源報價時間）；使用快取時保留原刷新時間，失敗時明確標示舊資料。可直接修改旅行設定的 destination 更新首頁地點與天氣；設定載入失敗可按重新整理天氣重試。

## 公開資料與敏感資訊

靜態網站的程式與資料皆可被訪客讀取，不可放入私密 API 金鑰、憑證、訂房代碼或個資。`.env` 已忽略，但也不可將其內容寫進前端產物。後續選用天氣、匯率 API 時需確認允許公開前端存取；秘密金鑰必須置於其他受保護的後端服務。


## 秋日福岡視覺

底色為 #F8F3EB，墨綠主視覺、磚紅強調、咖啡色增加層次，深色色塊使用白字。首頁 SVG 由程式直接繪製福岡塔、海灣、屋台、電車、秋樹、渡輪、街屋、石橋、路燈與長椅（不含小動物），是繪本式想像構圖，並非實際地理位置或交通路線圖；不需圖片服務或新增相依套件。


插畫題材參考：[福岡市官方觀光指南](https://www.gofukuoka.jp/articles/detail/fd2b889b-7457-493b-b5e4-49e274ed87bb)。


全站圖示採自繪日式手繪 SVG，集中於 index.html 的 symbol；icons.js 提供動態頁面共用的圖示建立函式，並已加入本機伺服器資源清單。

底部導航列新增「地圖」，參考 [FUKUOKA 地圖功能](https://github.com/Nigel-wei-zhe/FUKUOKA/blob/48a8a68c1aadcc3871210edbeff0b790e400f1ba/index.html)，在本專案重新整合日期篩選、地點圖釘、資訊與 Google 地圖導航。`maps.js` 從既有行程 JSONL 讀取地點；資料格式見 `data/FORMAT.md`。底圖為 OpenStreetMap，需要網路；載入失敗提供重試，地點清單仍可使用導航。現有行程是東京示範資料，尚未換成福岡實際行程。

Leaflet 1.9.4 放在 `vendor/leaflet/`，採 BSD-2-Clause，授權檔同目錄；不透過 CDN 載入程式。底圖保留 OpenStreetMap 來源標示。首頁移除自動生成的標語，`AGENTS.md` 與 `DESIGN.md` 已加入不產生標語的規範。

每日行程卡片可蓋章、取消蓋章，完成圖案改用使用者提供的酷洛米原圖編輯：去除身體與背景，保留頭下方的尖角花邊與粉紅圓球，加入楓葉髮飾，蓋章後順時針旋轉 15 度，存放於 `assets/stamps/kuromi-maple.png`。`visits.js` 依旅程 ID 與行程項目 ID 將紀錄保存在 localStorage，與行前清單分開；無法保存時顯示提示。地圖以外框及「已蓋章」文字標示完成地點。

## 設定

頁首右上角「設定」開啟設定 sheet，可調整字級（標準／大／特大）與日夜模式（跟隨系統／白天／夜間），設定保存在這台裝置的 localStorage（`tabi-settings-v1`），無法保存時仍可使用，但關閉網頁後恢復預設。`settings.js` 另提供共用 sheet 開關（`TabiSheet.openSheet()`／`closeSheet()`／`bindSheet()`）：背景鎖捲動、點背景／關閉按鈕／Esc 皆可關閉，關閉後回到原捲動位置與觸發按鈕。「加入主畫面」區塊已預留，尚未實作。

版本號統一在 `app.js` 的 `APP_VERSION` 設定，依「日期.當天第幾次」於合併至 `dev` 時更新，設定頁底部可查看目前版本與授權資訊。

## 開發工具

需要 Node 22 以上與 git；不需要安裝套件。

- 合併：`sh tools/merge-dev.sh 分支名稱…` 一次完成 rebase、檢查、版本號、push、刪分支與部署確認；`--dry-run` 只預覽，`--no-wait` 不等部署。若已安裝並登入 `gh`，會等 GitHub Pages 部署完成再回報。
- 截圖：`node tools/shot.mjs 行程 --day 2026-11-21 --fs 標準,特大 --theme 白天,夜間`，需要 Chrome（或用環境變數 `CHROME` 指定路徑）。頁面可選首頁、行程、店家、優惠、地圖；另有 `--open 設定`、`--scroll`、`--height`、`--eval`、`--out`。圖片預設在系統暫存資料夾的 `tabi-shots/`。
- 資料檢查：`node tools/check-data.cjs`。檢查格式、重複 ID、優惠券圖檔是否存在、路徑是否為相對路徑，並提醒空的行程日、缺座標項目、日期缺漏與空店家群組；錯誤會標明檔名與行號。
- 字型：`node tools/check-font.cjs` 檢查缺字；缺字時執行 `python3 tools/subset-font.py`（需 `pip install fonttools brotli`）重新產生子集。字型為 Noto Sans TC 與 Noto Serif TC 的子集，授權為 SIL OFL 1.1，見 `fonts/LICENSE.md`。
