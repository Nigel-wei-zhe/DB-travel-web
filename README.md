# 旅日手帖

手機優先的旅行網站首頁原型，使用 HTML、CSS 與原生 JavaScript。

開發前請閱讀 [開發規範](AGENTS.md)；修改畫面前另讀 [視覺與操作規範](DESIGN.md)。規範沿用 FUKUOKA 的開發與長輩友善原則，並依本專案的 JSONL 與分檔結構調整。

## 本地預覽

執行 `node dev-server.cjs`，開啟 http://127.0.0.1:5173 。無須安裝套件。

## GitHub Pages

網站網址：[旅日手帖](https://nigel-wei-zhe.github.io/DB-travel-web/)。儲存庫已公開，發布來源為 `dev` 分支根目錄；push 到 `origin/dev` 後由 GitHub Pages 自動部署，部署完成才會更新網站。

網站入口為根目錄的 `index.html`；資源採相對路徑，適用 GitHub Pages 專案子路徑。導覽使用 hash，不依賴伺服器路由。可將根目錄作為 GitHub Pages 發布來源，不需要建置步驟。`dev-server.cjs` 僅供本機開發。

目前旅行行程為示範資料。每日行程頁已接入 JSONL，包含行前檢查表、日期切換與地圖連結；精選店家使用 `data/shops.jsonl` 定義區域群組及店家類型標籤。優惠頁由 `data/coupons.jsonl` 載入圖片，支援放大與開啟原圖；圖檔放在 `assets/coupons/`。首頁天氣與匯率已使用公開 API。字體從 Google Fonts 載入，無網路時使用系統字體。

## 每日行程與行前清單

替換 `data/itinerary.jsonl` 與 `data/checklist.jsonl` 後重新整理即可。欄位與規則詳見 [資料格式](data/FORMAT.md)。檢查表勾選保存在當前裝置，依旅行 ID 分開。首頁目的地、標題、副標題、日期與天氣讀取 trip 設定。目前主視覺為福岡秋日旅行，既有東京行程與虛構店家仍保留為示範，尚未替換為福岡行程。旅行與項目 ID 保留以延用本機紀錄。

驗證：`node --test --test-isolation=none app.test.cjs trip-data.test.cjs maps.test.cjs`。

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
