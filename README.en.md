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

| Before | After |
|:---:|:---:|
| All-English UI, hunting for settings | Chinese interface, everything where you'd expect |
| Hesitant to click anything | Feels like a native app |
| Re-orienting yourself every session | Your choice is remembered, permanently |

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

1. Add the new locale to `supported-locales.txt` (e.g. `ja-JP`)
2. Create the locale directory and translation files (see `zh-CN/` for reference)
3. Open a PR

### Local build

```bash
# Build language pack distribution files
./build.sh

# Package Edge add-on zip
./build-edge-zip.sh
```

---

## FAQ

**Switched the language but nothing changed?**
Make sure the extension is enabled, then refresh claude.ai.

**Will this affect my Claude account?**
No. The extension operates entirely in the browser and doesn't modify any account settings or communicate with Anthropic's servers (other than the normal language pack fetch).

**Can I switch back to English afterwards?**
Absolutely. Select any officially supported language from the language menu and the extension automatically exits Chinese mode.

**Are language packs updated automatically?**
Yes. The extension detects remote updates via version hashes and downloads the latest pack when one is available.

---

## License

[MIT](LICENSE) © 2026 [Pectics](https://github.com/Pectics)

---

<div align="center">

If this extension is useful to you, a Star ⭐ is the best way to show it.

</div>
