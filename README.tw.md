<div align="center">

<img src="extension/assets/logo.512x.png" width="120" alt="Claude i18n Logo" />

# Claude i18n

**給 Claude.ai 加上一個並不存在的語言。**

[简体中文](README.md) | 繁體中文 | [English](README.en.md)

[![Version](https://img.shields.io/badge/版本-v1.0.0-orange?style=flat-square)](https://github.com/pectics/claude-web-i18n/releases)
[![License](https://img.shields.io/badge/授權-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/平台-Chrome%20%7C%20Edge-brightgreen?style=flat-square)](#安裝)
[![Locale](https://img.shields.io/badge/已支援-簡體中文-red?style=flat-square)](#支援的語言)

</div>

---

## 它能做什麼？

Claude 官方至今不支援簡體中文介面。**這個擴充功能解決了這個問題。**

安裝後，Claude Web 的語言選單裡會出現 **簡體中文** 選項。點一下，近萬條 UI 文字瞬間切換為中文。不需要代理，不需要設定，不需要等 Anthropic 哪天心情好了才支援。

<div align="center">

| 之前 | 之後 |
|:---:|:---:|
| 介面全英文，找個設定找半天 | 簡體中文，一眼就知道在哪 |
| 不敢用怕誤觸什麼 | 用起來像母語一樣自然 |
| 每次重整都得重新適應 | 記住你的選擇，永久生效 |

</div>

---

## 安裝

### 方式一：從 Releases 下載（推薦）

> ⚡ 30 秒搞定，無需任何技術知識

1. 前往 [Releases 頁面](https://github.com/pectics/claude-web-i18n/releases)，下載最新版本的 `.crx` 檔案
2. 開啟 Chrome / Edge，進入 `chrome://extensions/`
3. 開啟右上角的 **開發人員模式**
4. 將下載的 `.crx` 檔案**直接拖進**瀏覽器視窗
5. 點擊「新增擴充功能」確認安裝
6. 開啟 [claude.ai](https://claude.ai)，點擊左下角使用者名稱 → 語言 → **簡體中文** ✓

### 方式二：從原始碼建置

```bash
git clone https://github.com/pectics/claude-web-i18n.git
cd claude-web-i18n
```

然後在 `chrome://extensions/` 中開啟**開發人員模式**，選擇「載入未封裝項目」，選取專案的 `extension/` 目錄。

### 方式三：應用程式商店安裝（審核中）

Chrome Web Store 和 Edge 附加元件商店的版本正在審核，上架後會在此更新連結，敬請期待。

---

## 它是怎麼運作的？

Claude 的後端介面拒絕 `zh-CN` 這個 locale 值（會直接回傳驗證錯誤）。所以這個擴充功能沒有去碰後端——它在瀏覽器端攔截了所有語言包請求，把它們替換成託管在 Vercel 上的中文資源。

```
你點擊「簡體中文」
        ↓
擴充功能注入自訂選單項目（與原生選單外觀一致）
        ↓
Claude 發出 /i18n/*.json 請求
        ↓
擴充功能在頁面層攔截請求（無感知）
        ↓
回傳 9951 條精心翻譯的中文文字
        ↓
UI 全面切換為中文，無需重整
```

**智慧快取：** 語言包在本機雙重快取（Cache Storage + chrome.storage.local），搭配版本雜湊校驗。第一次載入後，後續切換幾乎瞬間完成，且在版本沒有更新時完全不發出網路請求。

---

## 支援的語言

| 語言 | 翻譯條目 | 狀態 |
|------|----------|------|
| 簡體中文 (zh-CN) | 9,951 條 | ✅ 可用 |
| 更多語言 | — | 歡迎貢獻 |

---

## 參與貢獻

### 改進翻譯

翻譯檔案位於 [`zh-CN/zh-CN.json`](zh-CN/zh-CN.json)。原文對照在 [`.original/en-US.json`](.original/en-US.json)。

直接編輯 JSON 檔案送出 PR 即可，結構非常簡單：

```json
{
  "some.ui.key": "對應的中文翻譯"
}
```

### 新增語言

1. 在 `supported-locales.txt` 中新增 locale（如 `ja-JP`）
2. 建立對應目錄和翻譯檔案（參考 `zh-CN/` 的結構）
3. 送出 PR

### 本地建置

```bash
# 建置語言包發佈檔案
./build.sh

# 打包 Edge 版本 zip
./build-edge-zip.sh
```

---

## 常見問題

**切換語言後沒有效果？**
確認擴充功能已啟用，然後重新整理 claude.ai 頁面。

**會影響我的 Claude 帳號嗎？**
不會。擴充功能只在瀏覽器端運作，不修改任何帳號設定或與 Anthropic 伺服器互動（除了正常的語言包拉取）。

**切換回英文還能正常使用嗎？**
完全沒問題。在語言選單選擇任意官方支援的語言，擴充功能會自動退出中文模式。

**語言包會自動更新嗎？**
會。擴充功能透過版本雜湊偵測遠端更新，有新版本時自動下載最新語言包。

---

## 授權

[MIT](LICENSE) © 2026 [Pectics](https://github.com/Pectics)

---

<div align="center">

如果這個擴充功能幫到了你，可以請我喝杯咖啡 ☕<br>
或者……點個 ⭐，也是莫大的支持。

[![PayPal](https://img.shields.io/badge/PayPal-Pectics-142c8e?style=flat-square&logo=paypal&logoColor=white)](https://paypal.me/Pectics)
[![愛發電](https://img.shields.io/badge/愛發電-Pectics-946ce6?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMTUgMjUgMTMwIDExMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTY1IDkwLjdjLTEuNiAwLTIuOCAxLjMtMi44IDIuOCAwIDEuNiAxLjMgMi44IDIuOCAyLjhzMi44LTEuMyAyLjgtMi44YzAtMS42LTEuMy0yLjgtMi44LTIuOFoiIGZpbGw9IndoaXRlIi8+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik05MS44IDk5LjJjMS42IDAgMi44IDEuMyAyLjggMi44IDAgMS42LTEuMyAyLjgtMi44IDIuOC0xLjYgMC0yLjgtMS4zLTIuOC0yLjggMC0xLjYgMS4zLTIuOCAyLjgtMi44WiIgZmlsbD0id2hpdGUiLz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEzNC42IDk4LjRjMi41IDEuNSA2LjUgNC4xIDUuMSA4LjctLjUgMS43LTEuNyAzLjEtMy40IDQtMCAwLS4xLjEtLjEuMS0yLjIgMS4xLTUuMSAxLjItNy43LjMtLjgtLjMtMS42LS41LTIuNS0uOC0uNi0uMi0xLjItLjQtMS44LS42LTEuOSAzLjEtNS44IDYuNS0xMS4zIDkuNC05LjkgNS4yLTI0LjggOC42LTQyIDQuOC0xMy4yLTIuOS0yMS45LTguMy0yNS44LTE2LTMuMS02LjEtMi40LTEyLjMtLjgtMTYuMSAxLjUtMy4xIDUuNy03LjEgMTAuOS0xMS4zLTEuMy0xLjUtMi41LTMuNC0yLjQtNS4zIDAtMS42LjgtMi45IDIuMi0zLjggMy41LTIuNCA4LjItLjUgMTEuMSAxLjIgMS43LTEuMSAzLjMtMi4zIDQuOS0zLjMtMS4xLS40LTIuNy0uOC00LjctMS03LS43LTI1LjMtNC0zMS43LTYuOEMxOC45IDU1LjMgMTkuMSA0Ny44IDIwLjcgNDMuOWMyLjgtNi45IDE4LjEtMTEgMjUuMS0xMC44IDMuNC4xIDUuNCAxLjEgNi4xIDMuMSAxLjMgMy40LTIuNiA1LjMtNy43IDcuNy0xLjMuNi0yLjggMS40LTQuMyAyLjEgNy4xLjYgMTcuNy4yIDI1LjYtLjEgNi44LS4zIDEzLjItLjUgMTguNy0uNCAxOS4xLjQgMzQuMiA4LjQgNDQuNiAyMy43IDYuOCAxMCA0LjggMjAuMSAxLjcgMjcuOSAxLjQuMSAyLjcuNSA0IDEuNFpNNjEgNzYuNmMtMS4xLS40LTIuMi0uNi0yLjgtLjUuMi40LjcgMSAxLjIgMS42LjUtLjQgMS0uOCAxLjYtMS4yWm03Mi44IDI5LjhjLjUtLjMuNy0uNS44LS45LjItLjYtLjctMS4zLTIuNi0yLjQtMS40LS45LTIuOS0xLTUuMi0uNi0uMSAwLS4yIDAtLjMgMC0uMSAwLS4xIDAtLjIgMC0zLjUuMy02LjItMi45LTYuOC0zLjYtLjktMS4yLS43LTIuOC40LTMuOCAxLjEtLjkgMi44LS43IDMuOC40LjMuNC44LjggMS4yIDEuMSAzLjQtNy40IDUuNS0xNS45LS40LTI0LjUtOS42LTE0LjEtMjIuOC0yMS00MC40LTIxLjQtNS4zLS4xLTExLjcuMS0xOC40LjQtMTUuNi42LTI2LjcuOS0zMi45LTEuMS0uMS0wLS4xLS4xLS4yLS4xLTEuOC0uNi0zLjItMS4zLTQuMi0yLjMtMS0xLjEtMS0yLjguMS0zLjggMS4xLTEuMSAyLjgtMSAzLjguMS4xLjEuMy4yLjUuMyAyLjQtMi4xIDUuOS0zLjggOS4xLTUuNC4zLS4yLjctLjMgMS4xLS41LTIuNy4zLTYuMyAxLjEtMTAgMi41LTQuNyAxLjgtNi45IDMuNy03LjMgNC45LTIgNSA3IDkuNSAxMSAxMS4yIDUuNSAyLjQgMjIuNyA1LjYgMzAuMSA2LjQgNC43LjUgNy42IDEuOSA5LjMgMyA1LTMuMiA4LjktNS41IDEwLjEtNi4yIDEuMi0uOCAyLjktLjMgMy42LjlzLjMgMi45LS45IDMuN2MtMTQuMyA4LjQtMzYuNyAyMy4zLTM5LjggMjkuNy0xLjEgMi41LTEuNiA3IC43IDExLjUgMy4xIDYuMSAxMC44IDEwLjcgMjIuMiAxMy4yIDI1LjMgNS41IDQzLjItNS43IDQ3LjMtMTEuNC0uNC0uMy0uOC0uNy0xLjEtMS0uOS0xLjItLjctMi45LjUtMy43IDEuMi0uOSAyLjktLjcgMy43LjUuNS43IDMuNCAxLjUgNSAyIC45LjMgMS44LjYgMi43LjkgMS4zLjQgMi42LjQgMy42LS4xWiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=)](https://afdian.com/a/pectics)

| 微信讚賞 | 支付寶 |
|:---:|:---:|
| <img src="donate/wechat.png" width="160" alt="微信讚賞碼" /> | <img src="donate/alipay.png" width="160" alt="支付寶收款碼" /> |
</div>
