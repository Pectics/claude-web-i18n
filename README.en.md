<div align="center">

<img src="extension/assets/logo.512x.png" width="120" alt="Claude i18n Logo" />

# Claude i18n

**Gives Claude.ai a language that doesn't officially exist.**

[简体中文](README.md) | [繁體中文](README.tw.md) | English

[![Version](https://img.shields.io/badge/version-v1.0.0-orange?style=flat-square)](https://github.com/pectics/claude-web-i18n/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-brightgreen?style=flat-square)](#installation)
[![Locale](https://img.shields.io/badge/supported-Simplified%20Chinese-red?style=flat-square)](#supported-languages)

</div>

---

## What does it do?

Claude's official interface has never supported Simplified Chinese. **This extension fixes that.**

After installation, a **简体中文** option appears in Claude Web's language menu. One click switches nearly 10,000 UI strings to Chinese — no proxy, no configuration, no waiting for Anthropic to get around to it.

<div align="center">

<img src="showcase-1.png" width="720" alt="Before and after comparison" />

<img src="showcase-2.png" width="720" alt="Fully translated Chinese interface" />

</div>

---

## Installation

### Option 1: Download from Releases (recommended)

> ⚡ Done in 30 seconds, no technical knowledge required

1. Go to the [Releases page](https://github.com/pectics/claude-web-i18n/releases) and download the latest `.crx` file
2. Open Chrome / Edge and navigate to `chrome://extensions/`
3. Enable **Developer mode** in the top-right corner
4. **Drag and drop** the downloaded `.crx` file into the browser window
5. Click "Add extension" to confirm
6. Open [claude.ai](https://claude.ai), click your username in the bottom-left → Language → **简体中文** ✓

### Option 2: Build from source

```bash
git clone https://github.com/pectics/claude-web-i18n.git
cd claude-web-i18n
```

Then in `chrome://extensions/`, enable **Developer mode**, click "Load unpacked", and select the project's `extension/` directory.

### Option 3: Install from store (pending review)

Submissions to the Chrome Web Store and Edge Add-ons store are currently under review. Links will be added here once approved.

---

## How does it work?

Claude's backend rejects `zh-CN` as a locale value — it returns a validation error if you try. So this extension doesn't touch the backend at all. Instead, it intercepts all i18n resource requests in the browser and serves Chinese content from a Vercel-hosted endpoint.

```
You click "简体中文"
        ↓
Extension injects a custom menu item (visually matches the native dropdown)
        ↓
Claude fires /i18n/*.json requests
        ↓
Extension intercepts them at the page level (transparently)
        ↓
Returns 9,951 carefully translated Chinese strings
        ↓
UI switches to Chinese — no page reload needed
```

**Smart caching:** Language packs are cached locally in two layers (Cache Storage + chrome.storage.local), with version hash verification. After the first load, subsequent switches are nearly instant and generate zero network requests unless a new version is available.

---

## Supported languages

| Language | Strings | Status |
|----------|---------|--------|
| Simplified Chinese (zh-CN) | 9,951 | ✅ Available |
| More languages | — | Contributions welcome |

---

## Contributing

### Improving translations

The translation file is at [`zh-CN/zh-CN.json`](zh-CN/zh-CN.json). The original English strings are in [`.original/en-US.json`](.original/en-US.json).

Edit the JSON file and open a PR. The structure is straightforward:

```json
{
  "some.ui.key": "translated string"
}
```

### Adding a new language

1. Add a new locale entry to [`locales.json`](locales.json) (e.g. `{"locale": "zh-TW", "name": "繁體中文 (台灣)"}`)
2. Create the locale directory and translation files (see `zh-CN/` for reference)
3. Open a PR

### Local build

```bash
# Build language pack distribution files for Vercel
./build.sh

# Package the browser extension zip
./package-extension-zip.sh
```

---

## FAQ

**Switched the language but nothing changed?** \
Make sure the extension is enabled, then refresh claude.ai.

**Will this affect my Claude account?** \
No. The extension operates entirely in the browser and doesn't modify any account settings or communicate with Anthropic's servers (other than the normal language pack fetch).

**Can I switch back to English afterwards?** \
Absolutely. Select any officially supported language from the language menu and the extension automatically exits Chinese mode.

**Are language packs updated automatically?** \
Yes. The extension detects remote updates via version hashes and downloads the latest pack when one is available.

---

## License

[MIT](LICENSE) © 2026 [Pectics](https://github.com/Pectics)

---

<div align="center">

If this extension has been useful to you, feel free to buy me a coffee ☕ \
Or simply leave a Star ⭐ — that means a lot too.

[![afdian](https://img.shields.io/badge/afdian-Pectics-946ce6?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMTUgMjUgMTMwIDExMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTY1IDkwLjdjLTEuNiAwLTIuOCAxLjMtMi44IDIuOCAwIDEuNiAxLjMgMi44IDIuOCAyLjhzMi44LTEuMyAyLjgtMi44YzAtMS42LTEuMy0yLjgtMi44LTIuOFoiIGZpbGw9IndoaXRlIi8+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik05MS44IDk5LjJjMS42IDAgMi44IDEuMyAyLjggMi44IDAgMS42LTEuMyAyLjgtMi44IDIuOC0xLjYgMC0yLjgtMS4zLTIuOC0yLjggMC0xLjYgMS4zLTIuOCAyLjgtMi44WiIgZmlsbD0id2hpdGUiLz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEzNC42IDk4LjRjMi41IDEuNSA2LjUgNC4xIDUuMSA4LjctLjUgMS43LTEuNyAzLjEtMy40IDQtMCAwLS4xLjEtLjEuMS0yLjIgMS4xLTUuMSAxLjItNy43LjMtLjgtLjMtMS42LS41LTIuNS0uOC0uNi0uMi0xLjItLjQtMS44LS42LTEuOSAzLjEtNS44IDYuNS0xMS4zIDkuNC05LjkgNS4yLTI0LjggOC42LTQyIDQuOC0xMy4yLTIuOS0yMS45LTguMy0yNS44LTE2LTMuMS02LjEtMi40LTEyLjMtLjgtMTYuMSAxLjUtMy4xIDUuNy03LjEgMTAuOS0xMS4zLTEuMy0xLjUtMi41LTMuNC0yLjQtNS4zIDAtMS42LjgtMi45IDIuMi0zLjggMy41LTIuNCA4LjItLjUgMTEuMSAxLjIgMS43LTEuMSAzLjMtMi4zIDQuOS0zLjMtMS4xLS40LTIuNy0uOC00LjctMS03LS43LTI1LjMtNC0zMS43LTYuOEMxOC45IDU1LjMgMTkuMSA0Ny44IDIwLjcgNDMuOWMyLjgtNi45IDE4LjEtMTEgMjUuMS0xMC44IDMuNC4xIDUuNCAxLjEgNi4xIDMuMSAxLjMgMy40LTIuNiA1LjMtNy43IDcuNy0xLjMuNi0yLjggMS40LTQuMyAyLjEgNy4xLjYgMTcuNy4yIDI1LjYtLjEgNi44LS4zIDEzLjItLjUgMTguNy0uNCAxOS4xLjQgMzQuMiA4LjQgNDQuNiAyMy43IDYuOCAxMCA0LjggMjAuMSAxLjcgMjcuOSAxLjQuMSAyLjcuNSA0IDEuNFpNNjEgNzYuNmMtMS4xLS40LTIuMi0uNi0yLjgtLjUuMi40LjcgMSAxLjIgMS42LjUtLjQgMS0uOCAxLjYtMS4yWm03Mi44IDI5LjhjLjUtLjMuNy0uNS44LS45LjItLjYtLjctMS4zLTIuNi0yLjQtMS40LS45LTIuOS0xLTUuMi0uNi0uMSAwLS4yIDAtLjMgMC0uMSAwLS4xIDAtLjIgMC0zLjUuMy02LjItMi45LTYuOC0zLjYtLjktMS4yLS43LTIuOC40LTMuOCAxLjEtLjkgMi44LS43IDMuOC40LjMuNC44LjggMS4yIDEuMSAzLjQtNy40IDUuNS0xNS45LS40LTI0LjUtOS42LTE0LjEtMjIuOC0yMS00MC40LTIxLjQtNS4zLS4xLTExLjcuMS0xOC40LjQtMTUuNi42LTI2LjcuOS0zMi45LTEuMS0uMS0wLS4xLS4xLS4yLS4xLTEuOC0uNi0zLjItMS4zLTQuMi0yLjMtMS0xLjEtMS0yLjguMS0zLjggMS4xLTEuMSAyLjgtMSAzLjguMS4xLjEuMy4yLjUuMyAyLjQtMi4xIDUuOS0zLjggOS4xLTUuNC4zLS4yLjctLjMgMS4xLS41LTIuNy4zLTYuMyAxLjEtMTAgMi41LTQuNyAxLjgtNi45IDMuNy03LjMgNC45LTIgNSA3IDkuNSAxMSAxMS4yIDUuNSAyLjQgMjIuNyA1LjYgMzAuMSA2LjQgNC43LjUgNy42IDEuOSA5LjMgMyA1LTMuMiA4LjktNS41IDEwLjEtNi4yIDEuMi0uOCAyLjktLjMgMy42LjlzLjMgMi45LS45IDMuN2MtMTQuMyA4LjQtMzYuNyAyMy4zLTM5LjggMjkuNy0xLjEgMi41LTEuNiA3IC43IDExLjUgMy4xIDYuMSAxMC44IDEwLjcgMjIuMiAxMy4yIDI1LjMgNS41IDQzLjItNS43IDQ3LjMtMTEuNC0uNC0uMy0uOC0uNy0xLjEtMS0uOS0xLjItLjctMi45LjUtMy43IDEuMi0uOSAyLjktLjcgMy43LjUuNS43IDMuNCAxLjUgNSAyIC45LjMgMS44LjYgMi43LjkgMS4zLjQgMi42LjQgMy42LS4xWiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=)](https://afdian.com/a/pectics)
[![PayPal](https://img.shields.io/badge/PayPal-Pectics-142c8e?style=flat-square&logo=paypal&logoColor=white)](https://paypal.me/Pectics)

| WeChat Pay | Alipay |
|:---:|:---:|
| <img src="donate/wechat.png" width="160" alt="WeChat Pay QR Code" /> | <img src="donate/alipay.png" width="160" alt="Alipay QR Code" /> |
</div>
