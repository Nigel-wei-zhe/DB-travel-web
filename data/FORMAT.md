# 旅行資料格式

所有資料採 UTF-8 JSONL：每個非空行是一個完整 JSON 物件，不要加外層陣列、行尾逗號或註解。可使用 LF / CRLF 與 UTF-8 BOM，空白行忽略。修改 JSONL 後重新整理網站，無須編譯。

## itinerary.jsonl

第一行為 trip，後續每行為 day，至少一天。日期自動排序，行程項目維持陣列順序。

| 物件 | 必填 | 選填 |
| --- | --- | --- |
| trip | type=`trip`、id、title、timezone、currency | destination、subtitle |
| day | type=`day`、date、title、location、items | — |
| location | name、latitude、longitude | — |
| items 中的項目 | id、title | time、category、note、mapQuery、coordinates |

- `trip.id`：穩定且唯一的旅行 ID，不同旅行請更換。
- `timezone`：IANA 時區，例如 `Asia/Tokyo`，用來判斷當地今天與預設頁籤。
- `currency`：三個大寫字母的貨幣代碼，例如 `JPY`。首頁匯率目前使用 JPY/TWD。首頁標題、日期與天氣已讀取本檔旅行設定。
- `destination`：選填物件，包含必填 `name`、`country`、`latitude`、`longitude`。名稱與國家不可空白，座標須在有效範圍。首頁地點與天氣共用此設定，天氣快取依座標與時區隔離。
- `subtitle`：選填非空白文字，顯示在首頁標題下方。
- `date`：有效的 `YYYY-MM-DD`，不可重複。
- `latitude` / `longitude`：數字，範圍 -90～90 / -180～180。首頁天氣優先使用 `trip.destination` 座標；未填時使用第一天 location，時區使用 `trip.timezone`。
- `items`：陣列；空陣列會顯示未安排提示。
- 行程 `id`：整趟旅行中不可重複。
- `time`：24 小時制 `HH:mm`；不填則顯示「彈性」。
- `category`：`transport`、`sightseeing`、`food`、`shopping`、`stay`、`other` 其中之一。
- `note`：文字，可用 JSON 的 `\n` 表示換行。
- `mapQuery`：地點搜尋文字，由頁面安全編碼成 Google Maps 連結；不填就不顯示地圖入口。

## checklist.jsonl

每行一項，必填 `id`、`group`、`title`，選填 `note`。ID 不可重複；相同 group 合併為一組，分組與項目依檔案順序呈現。空檔案會顯示無檢查項目。

勾選狀態獨立儲存在 localStorage，以 trip.id 區分旅行、項目 id 區分檢查項目。調整文字時保留 id 即可延用勾選紀錄。不同裝置不自動同步，清除瀏覽器資料會清除紀錄。

## shops.jsonl（精選店家）

每行一個區域群組：`id`、`title`、`shops` 必填。`title` 為區域名稱，例如「東京・表參道」；同區店家放在同一群組，不依類型分組。群組與店家皆依資料順序顯示；群組 ID 不可重複。

`shops` 為店家陣列，每家必填 `id`、`name`，選填 `tags`（店家類型的文字陣列）、`note`（備註）、`mapQuery`（Google Maps 搜尋文字）。例如 `tags: ["咖啡", "甜點"]` 在卡片上顯示為標籤。店家 ID 在整個檔案中不可重複；空群組會顯示尚未加入店家的提示。以下僅示範格式，並非真實店家推薦：

```jsonl
{"id":"omotesando","title":"東京・表參道","shops":[{"id":"cafe-01","name":"店家名稱","tags":["咖啡","甜點"],"note":"想點的餐點或注意事項","mapQuery":"店家名稱 表參道"}]}
```

網站目前提供三組、六家虛構店家的示範資料，地圖連結指向區域而非真實店家。可修改群組名稱、放入真實店家，或新增其他群組。此頁沿用 `#shopping` 網址。

## coupons.jsonl（優惠券）

每行一張優惠券，必填 `id`、`shop`（店家名稱）、`image`（圖檔相對路徑）、`alt`（圖片文字說明），選填 `note`（使用條件或備註）。ID 不可重複，依資料順序顯示。點擊圖片開啟放大視窗，也可開啟原圖。

```jsonl
{"id":"coupon-01","shop":"店家名稱","image":"./assets/coupons/coupon-01.jpg","alt":"店家優惠券與使用條件","note":"使用期限及適用門市請依圖檔。"}
```

將圖片放入 `assets/coupons/`，支援 PNG、JPG、JPEG、WebP、GIF、SVG，檔名可含中英文、數字、空白、底線、連字號與句點。維持原圖比例，避免裁掉優惠條件或條碼；請勿公開個人專屬或含敏感資訊的優惠券。目前 sample.svg 是無兌換效力的示範圖。

## 導覽與公開資料

「行前」由程式加入，不要建立假的行程日期。出發前預設行前，旅行中選當地日期對應的行程，旅行結束後選最後一天。若日期不連續，選最近一個已開始的行程日。

可直接開啟 `#itinerary/pretrip` 或 `#itinerary/2026-11-12`；頁籤切換支援瀏覽器上一頁。資料全部以文字建立 DOM，不將資料內容當作 HTML 執行。公開 JSONL 請勿放入護照、訂房代碼、私人聯絡資訊或其他秘密。

## 行程地圖座標

每個行程項目可填 `coordinates: {"latitude":35.7101,"longitude":139.8107}`；緯度必須在 -90～90、經度在 -180～180，均為有限數字。只有已設定座標的項目顯示圖釘，未設定時仍保留在地圖清單，不使用當日城市座標代替地點。地圖支援 `#map`、`#map/YYYY-MM-DD` 與 `#map/YYYY-MM-DD/項目ID`；圖釘資訊與導航沿用項目名稱、時間、分類、備註與 `mapQuery`。

目前補入的東京示範座標為地標或區域代表點，餐飲與購物項目並非指定店家；來源為 Wikipedia 各地標條目的座標（Narita International Airport、Kaminarimon、Tokyo Skytree、Meiji Shrine、Omotesandō、Shibuya Station、Ueno Park）。未新增或變更原行程 ID、時間與內容。
