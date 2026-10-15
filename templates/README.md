# Google 試算表 CSV 範本

將三個 CSV 分別匯入同一份 Google 試算表的三個工作表。第一列是固定欄名；從第二列開始填資料，不要更改欄名。檔案只有欄名，沒有示範資料。之後同步程式讀取這三個工作表，產生 `data/itinerary.jsonl` 與 `data/shops.jsonl`。網站目前不能直接讀 CSV。

## 旅行設定：trip.csv

只填一列。`trip_id`、`trip_title`、`timezone`、`currency` 必填；例如時區用 `Asia/Tokyo`，貨幣用 `JPY`。`subtitle` 可留空。首頁要顯示目的地並取得當地天氣時，`destination_name`、`destination_country`、`destination_latitude`、`destination_longitude` 四欄一起填；不填則四欄全部留空，網站會以第一天的地點座標取得天氣。

## 每日行程：itinerary.csv

每個行程項目一列。同一天的 `date`、`day_title`、`location_name`、`location_latitude`、`location_longitude` 每列都要重複填寫且內容一致。沒有行程項目的日期也要填一列，前五欄填好，`item_id` 到 `item_longitude` 全部留空，網站才會顯示「尚未安排行程」。

`date` 固定填 `YYYY-MM-DD`，例如 `2026-11-12`；`item_time` 固定填 24 小時制 `HH:mm`，例如 `09:05`，可留空表示彈性。請在試算表中將日期和時間欄設為「純文字」，避免匯出時格式改變。`location_latitude`、`location_longitude` 是當日城市座標，必填數字；`item_latitude`、`item_longitude` 是該行程地圖圖釘座標，可一起留空，不能只填其中一欄。

有行程項目的列，`item_id`、`item_title` 必填。`item_category` 可填 `transport`（交通）、`sightseeing`（景點）、`food`（飲食）、`shopping`（購物）、`stay`（住宿）、`other`（其他），也可留空。`item_note` 與 `item_map_query` 可留空；後者填可供 Google 地圖搜尋的地點文字。列的先後順序就是同一天網站顯示的順序，日期則由網站自動排序。

## 精選店家：shops.csv

每間店家一列。同一群組的 `group_id`、`group_title` 每列都要重複填寫且內容一致。沒有店家的群組也要填一列，前兩欄填好，`shop_id` 到 `shop_map_query` 全部留空。

有店家的列，`shop_id`、`shop_name` 必填。`shop_tags` 用半形直線 `|` 分隔多個標籤，例如 `咖啡|甜點`；不需要標籤可留空。`shop_note`、`shop_map_query` 可留空。群組依第一次出現的順序顯示，組內店家依列順序顯示。

## 同步程式的轉換規則

1. 讀取 CSV 時依標準 CSV 規則處理引號、逗號與儲存格內換行；忽略完全空白的列。不要用逗號直接切字串。
2. `trip.csv` 必須恰有一筆資料，轉成 `itinerary.jsonl` 第一行的 `type: "trip"`。`trip_id` 等欄位對應 `id` 等欄位；非空白的目的地四欄組成 `destination` 物件。
3. `itinerary.csv` 至少要有一天。依 `date` 分組，檢查同日的標題和地點欄一致；每組轉成一筆 `type: "day"`，其中 `location` 由 `location_*` 欄位組成，`items` 保留原列順序。行程欄位全空的列產生空 `items`，不得與同日的實際項目並存。非空白的 `item_latitude` 與 `item_longitude` 組成 `coordinates`。
4. `shops.csv` 依 `group_id` 分組，檢查同群組的 `group_title` 一致。每組轉成一筆物件，`shops` 保留原列順序；用 `|` 拆開非空白的 `shop_tags`，去除每個標籤前後空白。空店家列產生空 `shops`，不得與同群組的實際店家並存。
5. 空白的選填欄位直接省略，不輸出空字串或 `null`。座標轉成數字。輸出 UTF-8 JSONL，每行一個 JSON 物件；先用 `trip-data.js` 的 `parseItinerary`、`parseShops` 驗證，驗證失敗就停止，不覆蓋原本的 JSONL。

同一趟旅行請保留原本的 `trip_id` 和既有行程的 `item_id`，才會延續本機蓋章紀錄。新旅行再建立新 ID。不要在公開試算表或網站資料中放訂房代碼、私人電話等敏感內容。完整 JSONL 規則見 [`data/FORMAT.md`](../data/FORMAT.md)。
