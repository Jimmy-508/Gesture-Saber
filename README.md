# Gesture Saber — Phase 1

獨立、純前端的雙光劍自由揮劍實驗室。React + TypeScript + Vite、Three.js、MediaPipe Hand Landmarker。沒有後端、API Key、音樂、節奏方塊或計分。

## 開發

需要 Node.js 24 與 npm。

```sh
npm ci
npm run dev
```

開啟終端機顯示的 `/Gesture-Saber/` 網址。本機 localhost 可用攝影機；平板必須透過 HTTPS 網站開啟，不能直接使用電腦的 HTTP 區網網址。

```sh
npm test
npm run build
npm run preview
```

`assets` 腳本從已安裝的 MediaPipe 套件複製 WASM，並下載官方 float16 v1 Hand Landmarker 模型。首次開發與 CI 建置需要網路；執行時模型、WASM、Worker 均從同一網站載入。模型約 7.8 MB；WASM 約 13 MB。沒有錄影、上傳影格或分析服務。介面使用 Google Fonts，字型失敗時採用系統字型。

## 操作

1. 建議使用最新版 Safari / Chrome，平板橫向，保持明亮，距鏡頭約一臂距離。
2. 點擊「開始攝影機」，允許前置攝影機權限。
3. 兩隻手完整入鏡。左手藍劍、右手紅劍。至少三根手指伸直約 110 ms 啟動；少於兩根伸直約 80 ms 收劍。
4. 二根手指屬於中間狀態，保持原先啟閉狀態。失去追蹤會隱藏，重新進入要再次穩定張掌。
5. 握柄跟隨掌心，使用世界關鍵點建立掌面三軸方向；位置與四元數採時間相關平滑。深度為掌寬估計，不是精確空間測量。
6. 設定可選擇省電 / 平衡 / 精緻，控制像素比與目標追蹤頻率。追蹤在 Worker 內執行，至多一個影格正在處理；不堆積延遲影格。畫面獨立使用 requestAnimationFrame。
7. 切換分頁時釋放攝影機並隱藏光劍，返回後點擊重新啟動。攝影機拒絕、裝置占用、模型失敗與逾時均可重新嘗試。

「先看看光劍效果」僅展示渲染，不代表已追蹤雙手。FPS 為畫面更新頻率，Hz 為實際辨識回傳頻率，ms 為 Worker 辨識耗時，不等於完整端到端延遲。

## GitHub Pages

儲存庫名稱應為 `Gesture-Saber`。`vite.config.ts` 的 base 為 `/Gesture-Saber/`，Worker 與模型路徑均使用此 base。

在儲存庫 Settings → Pages → Source 選擇 **GitHub Actions**。推送 main 後 `.github/workflows/deploy.yml` 執行 npm ci、手勢測試、TypeScript 檢查、正式建置與 Pages 部署。Actions deployment 的 page_url 才是已確認的測試網址。變更儲存庫名稱需同步調整 base。

## 驗收與限制

自動測試涵蓋啟閉穩定時間、中間手勢、失蹤後重新追蹤，以及旋轉不變的伸指判定。瀏覽器可驗證展示、設定與錯誤狀態；真實雙手、左右標籤、握拳、轉掌、快速揮動、交叉遮擋及長時間效能仍需用 iPad / Android 前置攝影機實測。

實機清單：HTTPS 開啟 → 允許權限 → 左手藍 / 右手紅 → 張掌啟動 / 握拳收劍 → 轉掌方向 → 快揮光軌 → 離鏡隱藏 → 分頁暫停 / 重新啟動 → 三種畫質 → 橫向及直向排版。沒有實測資料前，不能聲稱通過平板流暢度或低延遲驗收。

MediaPipe 參考：[官方 Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。手別標籤按照模型對鏡像輸入的慣例，對原始攝影機畫面交換左右；畫面位置再鏡像一次以符合自拍直覺。
