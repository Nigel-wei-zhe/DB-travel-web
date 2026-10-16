# AGENTS.md

旅日手帖：給家族旅行使用的手機優先靜態網站。使用 HTML、CSS、原生 JavaScript 與 JSONL，沒有建置流程。給人看的說明在 `README.md`；**修改畫面前先讀 `DESIGN.md`**，資料格式以 `data/FORMAT.md` 與 `trip-data.js` 的驗證規則為準。

本規範參考 [FUKUOKA 的 AGENTS.md](https://github.com/Nigel-wei-zhe/FUKUOKA/blob/HEAD/AGENTS.md) 與 [DESIGN.md](https://github.com/Nigel-wei-zhe/FUKUOKA/blob/HEAD/DESIGN.md)，沿用開發流程、資料分離與長輩友善原則，檔案和指令依本專案調整。這是獨立專案，不是 FUKUOKA 的 fork。

## 分支與部署

- `origin`：`Nigel-wei-zhe/DB-travel-web`。沒有 `upstream`，不向 FUKUOKA 原作者開 PR。
- **開發都在 `dev` 分支**；若尚未存在，從目前 `main` 建立。`main` 保留穩定版本，不直接開發。
- **小功能先開功能分支**：從 `dev` 開 `feat-<名稱>`（不用 `/`）。push 到 `origin`、確認後再合回 `dev`，避免多個功能互相覆蓋。
- 儲存庫已依使用者授權公開。每次 push 功能後提供含完整 commit SHA 的手機預覽網址：`https://raw.githack.com/Nigel-wei-zhe/DB-travel-web/<commit sha>/index.html`。githack 只供個人預覽，不當正式網址分享；若未來改為私人，需改提供可存取的預覽方式，不得擅自再次公開。
- GitHub Pages 採 `dev` 分支根目錄（Deploy from a branch），網址為 `https://nigel-wei-zhe.github.io/DB-travel-web/`。push 到 `origin/dev` 會觸發部署；需確認部署成功，不能只憑 push 成功判定網站已更新。
- **合回 `dev` 時更新版本號**：採 `日期.當天第幾次`，例如 `2026.10.10.2`。版本號以 `app.js` 的 `APP_VERSION` 為單一來源，顯示於設定 sheet 底部；每次合併均更新，讓使用者能確認版本。
- **合回 `dev` 後清掉功能分支**：用 `git branch --merged dev` 確認完整合併後，再刪除本機與 `origin` 的對應功能分支，保留 `main`、`dev`。不要刪除他人或尚未合併的工作。
- 發布穩定版本前先確認 `main` 最新狀態，在 `dev` 解決衝突並驗證，再同步至 `main`。

## 檔案地圖

- `index.html`：頁面結構、SVG symbol、首頁與各分頁入口。
- `styles.css`：全站樣式；視覺規範見 `DESIGN.md`。
- `app.js`：hash 導覽、首頁天氣、匯率與換算。
- `settings.js`：共用 sheet（`openSheet()`／`closeSheet()`／`bindSheet()`，掛在 `window.TabiSheet`）與設定 sheet：字級、日夜模式，存在 localStorage `tabi-settings-v1`；`index.html` 的 `<head>` 有一段 inline script 先套用設定避免閃爍，兩處的鍵名與選項需同步。
- `trip-data.js`：JSONL 解析、欄位驗證、旅行日期選擇與資料載入。
- `itinerary.js`：每日行程、行前清單、勾選狀態。
- `shops.js`：依區域呈現精選店家。
- `visits.js`：依旅程與行程項目 ID 保存蓋章紀錄。
- `maps.js`：地圖、日期篩選、圖釘與導航。
- `coupons.js`：優惠券圖片與放大視窗。
- `data/itinerary.jsonl`：旅行設定與每天行程。
- `data/checklist.jsonl`：行前清單；勾選存在 localStorage，依旅行 ID 與項目 ID 對應。
- `data/shops.jsonl`：區域群組、店家與類型標籤。
- `data/coupons.jsonl`、`assets/coupons/`：優惠券資料與原圖。
- `data/FORMAT.md`：資料欄位、格式與範例。
- `dev-server.cjs`：本機靜態伺服器。
- `sw.js`：Service Worker；頂端集中 `VERSION`、`CORE_FILES`、網路優先清單。
- `manifest.webmanifest`、`icons/`：加入主畫面設定與圖示（`icon.svg`、`maskable.svg` 為 PNG 來源）。
- `app.test.cjs`、`trip-data.test.cjs`、`sw.test.cjs`：公開 API 行為、資料驗證與離線檔案清單測試。

已有共用設定入口（頁首「設定」按鈕）與設定 sheet，提供字級（標準／大／特大）與日夜模式（跟隨系統／白天／夜間）；「加入主畫面」區塊已預留但尚未實作。已有 Service Worker 與 manifest（新增檔案須加入 `CORE_FILES` 並遞增 `VERSION`）。目前沒有本機字型子集。以下相關規則是新增這些能力時的要求，不代表它們已存在；不要呼叫不存在的工具或函式。

## 常用指令

```sh
node dev-server.cjs
# 預覽：http://127.0.0.1:5173/，不要直接用 file:// 開啟

node --check app.js
node --test app.test.cjs trip-data.test.cjs maps.test.cjs visits.test.cjs sw.test.cjs
```

若 npm 可用，也可用 `npm run dev`、`npm run check`、`npm test`，不需要安裝套件。修改其他 JavaScript 檔時，也對該檔執行 `node --check`。

## 開發規則

- **內容和設定放在資料檔，不寫死在 HTML**：旅程名稱、日期、地點、座標、貨幣、電話、資訊頁內容放在 `data/`。本專案維持既有 JSONL 格式，不為了對齊 FUKUOKA 改成 `trip.json`。固定按鈕名稱與錯誤訊息可留在程式；與旅程無關的趣味文字和資訊頁資料，將來依用途獨立存放並記錄格式。
- 首頁目的地、天氣座標與匯率目前仍有固定值；後續處理這些功能時，改讀旅行設定，不新增另一份互相矛盾的設定。未被要求時，不順便重寫整個資料架構。
- 新增資料欄位或檔案要同步更新驗證、`data/FORMAT.md` 與 README；改完資料要跑資料測試。
- **路徑一律使用相對路徑**，例如 `./data/itinerary.jsonl`，不要以 `/` 開頭；須能在 GitHub Pages 的 `/DB-travel-web/` 子路徑運作。
- **不要新增 CDN 相依**。新增的 JS、CSS、圖示與字型放在 repo。現有 Google Fonts 是待處理的離線缺口，未處理前不可宣稱完整離線可用。公開天氣、匯率 API 可保留，但失敗必須有清楚的提示與重試。
- Service Worker 已導入（`sw.js`）：集中管理 `CORE_FILES` 與網路優先清單，HTML、旅行與資訊資料網路優先，其他本機資源快取優先；新增檔案同步加入清單，修改快取資源時遞增 `VERSION`。各 commit 預覽路徑的快取分開，不能用舊快取判定新版正確。
- **每頁頂端留白集中使用 `var(--top-gap)`**。處理安全區域時集中定義，避免各頁各自寫 `env(safe-area-inset-top) + Npx`。新增吸頂元件需確認 iPhone Safari 與主畫面模式不遮住內容。
- **顏色使用 CSS 變數**；導入夜間模式時，`:root` 與 `:root[data-theme="night"]` 都定義對應變數。修改既有區塊時逐步移除該區硬編碼顏色。
- 日夜模式、字級、加入主畫面等設定集中在同一個設定 sheet，不要散落各頁。尚未有設定入口時先建立共用入口。
- **字級可調**：標準／大／特大，`--fs` 為 1／1.18／1.36；新字級使用 `calc(Npx * var(--fs, 1))`，與文字並排的固定寬度也須考慮縮放。
- Sheet 使用共用的開關與綁定邏輯；新增共用機制時採 `openSheet()`／`closeSheet()`／`bindSheet()`。背景不得捲動穿透，關閉回到原捲動位置；高度隨內容，捲動區放 `.sheet-scroll`。把手＋標題＋內容，提供可點擊的操作，關閉動畫包含 Esc，需在 iPhone 實際測試。
- **資料優先用 `textContent` 與 DOM API 呈現**。若必須插入 `innerHTML`，資料先經 `esc()` 或等效跳脫；連結另外驗證協定與路徑，不能只跳脫 HTML。
- 保留現有分類 `transport`、`sightseeing`、`food`、`shopping`、`stay`、`other`，不要套用 FUKUOKA 的四分類而破壞資料。新增分類需同步驗證、格式文件、顯示名稱、圖示、兩套主題色與卡片樣式。
- 同時段擇一選項若新增，採同一天、同一時間、同一分類分組，不要求使用者額外維護可推導欄位，並提供可點擊的切換方式。
- **不要改既有旅行、行程、清單項目的 ID**，本機紀錄靠 ID 對應。新旅行才建立新旅行 ID。
- 未來若加入地圖底圖，採 OpenStreetMap 並保留來源標示；沒有 API key 不改用需要金鑰的 CARTO。
- API 要有逾時、回應驗證、錯誤處理與重試。快取資料須標明時間，失敗不可套假資料。不得在前端放秘密金鑰、憑證、訂房代碼或私人個資。

## 使用者：家族旅行，有年長者

新功能先確認：**長輩第一次拿到，不用人教就會用嗎？在戶外、走路中、光線很亮時看得清楚嗎？**

### 閱讀

- 內文至少 `calc(15px * var(--fs, 1))`；長段說明 16px、行高至少 1.6。13px 以下只放不影響理解的輔助文字，不放重要資訊。
- 一次只講一件事，內容多時拆分類，每段先結論再細節。
- 條列採「重點＋說明」，數字、金額、時間都寫清楚單位。
- 用平常說話的詞，少用英文縮寫；必要時附中文，例如「Visit Japan Web 線上辦理」。
- 文字對比至少 4.5:1，白天與夜晚均檢查；不能只靠顏色表達狀態。

### 操作

- 按鈕觸控範圍至少 44×44px，主要按鈕至少 48px，按鈕間隔至少 8px。
- 新按鈕優先圖示＋文字；純圖示僅用於熟悉的動作，仍需可存取名稱。
- 手勢不能是唯一操作方式。可滑內容露出下一張，或提供可點的替代入口。
- 重要操作能復原，少用確認對話框。
- 分類與分頁採容易發現的大按鈕，避免只有細小橫向標籤。
- 電話使用 `tel:`；地址和地點可直接開地圖。

## 不要做的事

- 沒被要求不改旅行行程與其他作者提供的內容。
- 不新增建置工具、框架或 npm 相依套件。
- 不設定 `user-scalable=no`，不鎖住兩指放大；按鈕可用 `touch-action: manipulation` 避免連點誤觸放大。
- 不擅自把私人 repo 改公開或啟用網站發布。

## 改完怎麼驗證

1. JavaScript 語法檢查與現有測試通過；新功能需要的驗證依實際風險補充。
2. 本機伺服器開啟，在 360px 寬度檢查首頁、行程、精選店家、優惠與 hash 上一頁導覽。
3. 檢查清單勾選保存、日期切換、地圖連結、優惠原圖與放大視窗；新功能以實際操作驗證。
4. 導入日夜模式與字級設定後，檢查兩套主題及「特大」字級；不得把尚未實作的功能回報為已測試。
5. API 失敗與無網路時有明確提示，快取標示正確；導入 PWA 後再驗證離線重新整理與更新流程。
6. iPhone Safari 確認頂端安全區、底部分頁列與 sheet；沒有實機時明確說明未驗證。

## 寫作慣例

- 不自行產生標語、宣傳口號或抒情文案；介面文字以功能、地點與實際資訊為主。

- 介面文字、README、commit 訊息使用台灣繁體中文。
- 口吻簡短直接，按鈕寫動作，例如「看地圖」「導航」；錯誤說清楚問題與修正方式。
- 不加「左右滑動看看」之類操作教學，靠露出下一張卡片、圓點或按鈕表現可操作性。
