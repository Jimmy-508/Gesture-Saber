# Gesture Saber — Phase 1.1

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
3. 兩隻手完整入鏡。左手藍劍、右手紅劍。至少三根手指伸直約 110 ms 啟動；少於兩根伸直約 80 ms 收劍。劍身約 160 ms 伸展、120 ms 收縮。
4. 二根手指屬於中間狀態，保持原先啟閉狀態。短於 260 ms 的遮擋保留狀態，超過後自動收劍；持續失蹤會隱藏握柄。超過 300 ms 才重新看到手時需再次穩定張掌。
5. 握柄跟隨掌心，使用世界關鍵點建立掌面三軸方向；位置與四元數採時間相關平滑。深度為掌寬估計，不是精確空間測量。
6. 設定可選擇省電 / 平衡 / 精緻，控制像素比與目標追蹤頻率。追蹤優先在 Worker 內執行，至多一個影格正在處理；不堆積延遲影格。畫面獨立使用 requestAnimationFrame。主執行緒備援採完成後排程，依推論耗時留下至少 35 ms 的讓出時間，目標上限 18 Hz。單次同步推論仍會阻塞主執行緒，不能保證所有舊型平板都流暢。
7. 切換分頁時釋放攝影機並隱藏光劍，返回後點擊重新啟動。攝影機拒絕、裝置占用、模型失敗與逾時均可重新嘗試。

「體驗光劍與動態音效」僅展示渲染和合成音效，不代表已追蹤雙手。FPS 為畫面更新頻率，Hz 為實際辨識回傳頻率，ms 為辨識耗時，不等於完整端到端延遲。

## Phase 1.1 攝影機診斷與備援

舊版正式 Worker 在開發環境的 Chromium 可載入並推論，無法據此重現使用者的特定 iPad 故障。確定的缺口是：攝影機與模型共用單一啟動狀態；唯一影格來源為 createImageBitmap(video)；Worker、影格轉換或推論失敗即結束，沒有相容備援。故不能聲稱已定位使用者裝置的唯一根因。

新版將 getUserMedia、video.play、首個可讀影格、模型載入及實際推論分段處理。診斷按鈕顯示各階段、模式、處理影格數、音訊狀態與故障原因。前置鏡頭使用 ideal 約束，不強制裝置無法提供的幀率。辨識用 video 元素使用 inline / muted 播放，保持極低不透明度而非 display:none、負圖層或移出視窗，避免部分瀏覽器停止解碼；攝影機影像不在遊戲中可見。

自動相容路徑：Worker + ImageBitmap(video) → Worker + canvas 轉 ImageBitmap → 主執行緒直接 video → 主執行緒 canvas。Worker 初始化、推論或轉換失敗只切換一次主執行緒，不重複載入或並行處理多個模型。也可在設定勾選「下次啟動直接使用相容辨識模式」。主執行緒模型載入序列化，取消時會關閉晚到的模型；取消權限請求時，晚到的串流亦立即停止。

瀏覽器測試曾確認：主執行緒不能使用與 Worker 相同的 ESM WASM glue，否則會出現 ModuleFactory not set。現在 Worker 使用 module loader，文件環境使用 classic loader，兩者均經正式建置推論檢查。

## 視覺與原創合成音效

光劍採 3D 圓弧收尖核心、細微能量流動 shader，以及依鏡頭與劍軸調整方向、徑向衰減的光暈；不使用全畫面 bloom。握柄重新建立金屬環境反射、粗糙深色握區、機械接縫、按鈕及 LED。光軌使用預配置緩衝，依劍尖位置與方向採樣、補間，逐樣本按時間淡出，超過位移門檻會切斷以避免跨畫面破面。低畫質仍保留核心與光暈，減少像素比、光軌壽命並關閉劍身點光源。

音效由 Web Audio 即時合成：每把劍各自的持續振盪器、過濾噪聲與啟閉音高掃頻，不使用電影或遊戲音效素材。張掌啟動同步伸展和啟動聲，握拳同步收縮和收束聲。追蹤更新時計算完整劍尖位移速度（含旋轉），連續控制音高、音量、低通頻率及破風噪聲；靜止不播放破風聲。開關及音量在設定中調整。AudioContext 只在點擊開始、展示或啟用音效時建立／恢復；結束、切分頁及卸載時停止聲源、斷開節點並關閉 context。

## 檢查

`npm test` 包含攝影機權限錯誤、video 播放失敗、前置鏡頭要求、串流晚到、資源釋放、Worker 初始化與推論故障、主執行緒切換與單影格排程、左右獨立伸縮、短暫失蹤、速度音效映射、連續聲源與音訊釋放。Web Audio 單元測試使用替身節點，不能驗證裝置實際聽感。

正式建置提供 `/Gesture-Saber/tests/engine-check.html`，手動點擊後以空白 canvas 檢查 Worker 實際模型載入／推論、主執行緒實際模型載入／推論，以及注入 Worker 初始化失敗後的備援。它不要求攝影機，不能當作實機雙手驗收。這個頁面和正式遊戲均由同一 Vite build 產生。

## GitHub Pages

儲存庫名稱應為 `Gesture-Saber`。`vite.config.ts` 的 base 為 `/Gesture-Saber/`，Worker 與模型路徑均使用此 base。

在儲存庫 Settings → Pages → Source 選擇 **GitHub Actions**。推送 main 後 `.github/workflows/deploy.yml` 執行 npm ci、手勢測試、TypeScript 檢查、正式建置與 Pages 部署。Actions deployment 的 page_url 才是已確認的測試網址。變更儲存庫名稱需同步調整 base。

## 驗收與限制

瀏覽器可驗證展示、音訊啟用狀態、設定、錯誤狀態及引擎檢查頁；真實雙手、左右標籤、握拳、轉掌、快速揮動、交叉遮擋、音效聽感及長時間效能仍需用 iPad / Android 前置攝影機實測。

實機清單：HTTPS 開啟 → 允許權限 → 左手藍 / 右手紅 → 張掌啟動 / 握拳收劍 → 轉掌方向 → 快揮光軌 → 離鏡隱藏 → 分頁暫停 / 重新啟動 → 三種畫質 → 橫向及直向排版。沒有實測資料前，不能聲稱通過平板流暢度或低延遲驗收。

MediaPipe 參考：[官方 Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。手別標籤按照模型對鏡像輸入的慣例，對原始攝影機畫面交換左右；畫面位置再鏡像一次以符合自拍直覺。
