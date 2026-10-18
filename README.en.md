<div align="center">

<img src="assets/icon128.png" width="112" alt="BOOTH Shelf icon">

# BOOTH Shelf

[한국어](README.md) · **English** · [简体中文](README.zh-CN.md)

**The fastest way to find the assets you bought on BOOTH**

A Chromium extension that lets you search your BOOTH library, received gifts, and free downloads on one screen,<br>
and organize them with favorites, categories, and folders up to three levels deep.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/aibjhdieagkjmcodaiopaklonjbdmbpj?label=Chrome%20Web%20Store&color=d22d45&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/aibjhdieagkjmcodaiopaklonjbdmbpj?utm_source=item-share-cb)
[![Users](https://img.shields.io/chrome-web-store/users/aibjhdieagkjmcodaiopaklonjbdmbpj?label=Users&color=20242c)](https://chromewebstore.google.com/detail/aibjhdieagkjmcodaiopaklonjbdmbpj?utm_source=item-share-cb)
[![GitHub Release](https://img.shields.io/github/v/release/KuroiineUshina/BOOTH-Shelf?label=Release&color=20242c)](https://github.com/KuroiineUshina/BOOTH-Shelf/releases/latest)
[![GPL-3.0 License](https://img.shields.io/badge/license-GPL--3.0-20242c)](LICENSE)

### [▶ Install from the Chrome Web Store](https://chromewebstore.google.com/detail/aibjhdieagkjmcodaiopaklonjbdmbpj?utm_source=item-share-cb)

Free · Open source · All data stays on your device

</div>

https://github.com/user-attachments/assets/f3fc61f1-6b18-4291-9339-c1505544dcab

## Preview

| Your whole library on one screen | Search by avatar name |
|:---:|:---:|
| <img src="store-assets/01-library.png" alt="Library view"> | <img src="store-assets/02-avatar-search.png" alt="Avatar search"> |
| **One item in many folders** | **Download only the files you need** |
| <img src="store-assets/03-folders.png" alt="Multi-folder filing"> | <img src="store-assets/04-download.png" alt="Download file list"> |
| **AI connection (MCP)** | |
| <img src="store-assets/05-ai-connection.png" alt="AI connection"> | |

<sub>The shops and items shown are fictional demo data.</sub>

> The app UI is available in Korean, English, and Japanese. Button names in this document use the English UI labels.

## Features

### 🔄 Sync
- Sync every page of the Library, Gifts, and Free downloads tabs at once
- Merge multiple owned avatar variants and purchased/gift/free entries of the same item page into a single card

### 🔍 Search
- Search by item title, seller name, download filename, and the supported avatars listed in item descriptions
- Multilingual search that links Korean, English, and Japanese avatar names from even a single typed character (e.g. `마누카` → `マヌカ` · `Manuka`)
- Analyzes the supported-model section of item descriptions and linked base-avatar item pages, so items are found even when the avatar isn't in the title or filename
- When an owned filename identifies an avatar-specific variant, only that variant matches; description-based support lists are used only as a fallback for generic files without an avatar marker
- Shows the BOOTH item type (3D clothing, 3D hair, etc.) under the title; click the type name or use the search box's **Type** scope to see only that type
- Filters for purchased items, received gifts, and free items, plus favorites
- A drum-style sort switch (purchase order / name) and an ascending/descending direction switch

### 🗂️ Organize
- Build folders up to three levels deep under collapsible categories, and rename, move, or delete them
- File one item into multiple folders at once and manage placements with checkboxes on the card
- Drag an item card onto a sidebar folder to add it there while keeping its existing placements
- Multi-select by clicking cards and drag several items together
- Give each folder its own description, preserved in backups
- Right-click menus on cards and folders for download, item page, seller shop, and folder management
- Back up and restore categories, folders, placements, and favorites as JSON

### 🛒 Cart
- Open **Cart** in the sidebar to see the items in your BOOTH cart grouped by shop, and search by title, seller, or option
- Mark or hide items you already own, and see per-shop subtotals and the overall total
- Cart contents stay in the page's memory and are never stored

### ♡ Wishlist
- Open **Wishlist** in the sidebar to see the items you liked (スキ) on BOOTH. Items you already own or have in your cart are hidden by default; turn on **Include cart** or **Include purchases** to show them
- Search by title or seller; sold-out and discontinued items are marked
- Wishlist contents also stay in the page's memory and are never stored

### ⬇️ Downloads and navigation
- Flip a card to see its download files and download the selected ones directly
- Click the title to open the BOOTH item page, or the seller name to open the seller's shop

### 🤖 AI connection (MCP)
- Lets AI tools such as Claude Code and Codex search and recommend items from your library and download the files you approve ([details](#-ai-connection-mcp-1))

### 🎨 Display and convenience
- Cycle the UI language Korean → English → 日本語 from the header's language icon
- Light, dark, and system themes (system mode follows OS changes automatically)
- 4, 5, or 6 cards per row and a sidebar you can resize by dragging
- Infinite scroll that loads more items as you near the end of the list
- The header's **Reality check** button totals the actual amounts paid on confirmed orders
- Fully delete stored items, favorites, categories, and folders from within the app
- Responsive layout and `prefers-reduced-motion` support

<details>
<summary>More details</summary>

- Selected cards use a subtle lift highlight with no jiggle.
- Click a card's image or padding to select or deselect items; starting a drag from any card moves only the selected group to a folder.
- When the dragged group touches the sidebar it smoothly shrinks to 75% size and 75% opacity, and the count badge moves with it.
- A drag that isn't dropped on a folder isn't treated as a click selection.
- Each item has **Add to folder / Manage folders** buttons for keyboard and touch use.
- Items with many download options get an independently scrolling file list inside the card.
- The theme button switches instantly without animation, and the setting is saved on this device.
- The header opens the developer's Ko-fi page and the backup, restore, and data-deletion settings.

</details>

## Installation

### Chrome Web Store (recommended)

1. Open the [BOOTH Shelf Chrome Web Store page](https://chromewebstore.google.com/detail/aibjhdieagkjmcodaiopaklonjbdmbpj?utm_source=item-share-cb) and click **Add to Chrome**.
2. Sign in to your [BOOTH library](https://accounts.booth.pm/library) in the same browser profile.
3. Click **BOOTH Shelf** in the toolbar and run **Sync all**.

The Web Store version is updated automatically by the browser once a new version is approved. If the icon isn't visible, pin BOOTH Shelf from the browser's extensions menu.

<details>
<summary>Install directly from a GitHub Release</summary>

1. Download `booth-shelf-vX.Y.Z.zip` from the [latest GitHub Release](https://github.com/KuroiineUshina/BOOTH-Shelf/releases/latest). Choose the file whose name starts with `booth-shelf-`, not GitHub's automatic **Source code** archive.
2. Extract the ZIP into a local folder you'll keep.
3. Open `chrome://extensions` in Chrome or a Chromium-based browser.
4. Turn on **Developer mode** in the top right.
5. Click **Load unpacked**.
6. Select the extracted `booth-shelf` folder.
7. Sign in to your [BOOTH library](https://accounts.booth.pm/library) in the same browser profile.
8. Click **BOOTH Shelf** in the toolbar and run **Sync all**.

An unpacked extension runs the JavaScript in the selected folder as-is. If you delete or move the folder, the extension stops loading, so keep it in a fixed location. If you use a synced folder such as OneDrive, don't share it with others and enable multi-factor authentication on the account.

**Updating**: Unpacked extensions installed from GitHub don't update automatically. Download the new Release ZIP, replace the files in your existing folder, then click BOOTH Shelf's **Reload** button in `chrome://extensions`. Your items and folders live in the browser's extension storage and remain as long as the extension ID stays the same, but it's a good idea to check your important organization data before updating.

</details>

## 🤖 AI connection (MCP)

AI tools such as Claude Code and Codex can search and recommend assets you've bought while you work in Unity, and download the files you approve.

> 💬 "Find an outfit I own that fits the avatar in this scene and download it"

1. Install Node.js 18 or later.
2. Install the connector once from a terminal. No administrator rights needed.
   ```bash
   npx booth-shelf-mcp install
   ```
   If you use an unpacked install from GitHub, add `--extension-id <extension ID>` as shown in BOOTH Shelf's settings.
3. Restart Chrome, then go to BOOTH Shelf **Settings → AI connection (MCP) → Turn on AI connection** and grant the permissions.
4. Installation automatically registers the MCP server with **Codex** (CLI and desktop app) and **Claude Code** on this PC. Open a new session to use the BOOTH tools. Add `--no-register` if you don't want automatic registration.

The tools available to the AI are library search, an item's file list, download, and download status.

- **By default, every download request opens an approval window in the browser, and only the files you allow** are saved to `Downloads/BOOTH Shelf/<seller>/<item>/`.
- If you turn off **Ask me before every download** in settings, files download without asking — still only BOOTH files from your own library, up to 30 at a time.
- The AI receives only item titles, sellers, types, supported avatars, and filenames — never download URLs or full item descriptions.
- The connector accepts only local programs that hold the secret token it generates fresh on every run.

See [mcp/README.md](mcp/README.md) for details.

## 🔒 Privacy and permissions

There is no separate server or analytics; all data is stored only in this browser's `chrome.storage.local`.

| Permission | When | Purpose |
|---|---|---|
| `storage` | Always | Store item info for search, plus favorites, categories, and folders on this device |
| `unlimitedStorage` | Always | Lift the default 10 MB local storage limit for large libraries. Reads or sends no additional data |
| `https://accounts.booth.pm/*` | Requested on first **Sync all**, **Reality check**, or **Wishlist** | Read the signed-in user's Library, Gifts, and Free downloads pages, payment amounts from order history when running **Reality check**, and your liked items when opening **Wishlist** |
| `https://booth.pm/*` | Requested on first **Sync all** or **Cart** | Read public descriptions and linked item pages of owned items to find supported avatars (sends no login information), and read your cart (uses your BOOTH sign-in, never stored) |
| `nativeMessaging` · `downloads` · `offscreen` | Requested only when turning on **AI connection** | Talk to the connector on this PC, download approved BOOTH files, and parse library pages that list download files. Released when AI connection is turned off |

<details>
<summary>What's stored and security details</summary>

Stored data: item ID, title, seller name, thumbnail URL, item URL, position in Library/Gifts/Free downloads, download filenames and displayed sizes, supported-avatar IDs detected from descriptions and when they were checked, favorites, category and folder structure and descriptions, and theme, language, cards-per-row, and sidebar width settings. Full item descriptions are not stored. Download filenames and supported-avatar IDs are used only for local search.

**Reality check** caches only per-currency totals, the number of confirmed orders, the number of free orders, and the calculation time on this device; order numbers and individual order contents are not stored. Cookies are never read or stored.

Actual download URLs are re-read from the BOOTH page when you open **Download**, kept only briefly in the current page's memory, and never written to `chrome.storage.local`. The selected URL is passed only to BOOTH using the same in-page download method as BOOTH's own button, without any download-history permission.

Clearing browser history does not clear extension storage, so use **Settings → Delete all saved data** in the header. This also revokes the BOOTH account and item page permissions.

Stored data and links are schema-checked on every load, and only allowed BOOTH addresses are used for account pages, items, sellers, and thumbnails. An explicit Content Security Policy (CSP) blocks remote code, arbitrary connections, frames, and embedded objects.

</details>

See the [privacy notice](PRIVACY.md) (Korean) for details. Please don't post details of security vulnerabilities in public issues; report them through the process in the [security policy](SECURITY.md).

## ⚙️ How data behaves

<details>
<summary>How sorting, folders, sync, and Reality check work</summary>

- **Purchase order, ascending** uses the page and card order shown in your BOOTH library as-is; descending reverses it.
- The sort-key button toggles purchase order and name; the direction button toggles ascending and descending. Sorting always uses the one combination shown on the two buttons.
- Categories don't count toward the three-level folder limit. Deleting a category doesn't delete its top-level folders; they move to **Uncategorized**.
- Re-syncing replaces the item list with the latest state while keeping favorites of remaining items and all category and folder placements.
- Dragging a card to a folder adds the new folder without changing existing placements. Dropping it on **Unfiled** removes all of that item's folder placements.
- Deleting a folder moves its subfolders and the placements in that folder up one level, leaving the item's other placements intact. Deleting a top-level folder only removes that folder's placements.
- Single-folder placement data and backup files from 1.0.5 and earlier are automatically converted to the multi-folder format on first load.
- Sync stops if BOOTH's page structure changes or a maintenance page is returned. The item list is saved only after all purchased, gift, and free lists are checked; if checking fails, the existing list and organization data are kept.
- **Sync all** reads purchased, gift, and free lists, download filenames and displayed sizes, and the supported-model section and base-avatar links in public item descriptions, saving them to a local search index. Full descriptions and link lists aren't stored — only the detected supported-avatar IDs. The app is usable as soon as the item list is saved; avatar detection continues in the background. Descriptions are read from BOOTH's lightweight public item JSON (`/items/<ID>.json`) instead of HTML pages. Each item's description index is reused for 30–45 days and saved incrementally, so later syncs don't re-request items already checked and rechecks don't all happen at once.
- Items whose description couldn't be read keep their existing support info and are rechecked on the next sync. Versions that change the description analysis also recheck older indexes.
- Opening **Download** on a card re-reads the actual download URLs from the latest library page. URLs aren't stored and disappear when the page closes. If the item's position changed and the list can't be found, run **Sync all** and try again.
- Reality check de-duplicates orders confirmed as paid in your order history (`paid`, `completed`, or delivered) and sums the payment amount on each order's detail page. Unpaid, cancelled, and refunded orders are excluded; BOOST and shipping may be included; received gifts are excluded. To reduce server load, the result is cached locally and refreshed only when you click **Calculate again**.
- Favorite, folder, and setting changes from multiple windows are applied in order against the latest saved value. A failed save is never shown as success.
- If sync, Reality check, backup restore, or data deletion overlap across windows, the later operation stops and asks you to retry. Reality check doesn't overlap with other operations until its summary is saved.
- Organization backups are limited to 32 MiB, with the same limit for export and import. If the limit is exceeded, an error is shown instead of producing a file that can't be restored.
- Requests start at least 300 ms apart. Sync runs up to 4 in parallel; download options and payment statistics up to 2 each, with retry back-off for transient BOOTH errors and rate-limit responses.
- Item descriptions are processed continuously without pausing for incremental saves. Saves run one at a time, and completion is shown only after the final save. Within the same sync, owned items and avatar links that point to the same item share fetch and analysis results.

</details>

According to BOOTH's official guidance, received gifts can be found in the library's [Gifts tab](https://accounts.booth.pm/library/gifts). Per the [BOOTH guidelines](https://booth.pm/guidelines), use this tool without putting excessive load on their servers. This project is an unofficial local tool, not an official pixiv or BOOTH product.

## ☕ Support

If you'd like to support the developer, use the Ko-fi cup icon in the app header or the [Ko-fi page](https://ko-fi.com/kuroiineushina). The link opens in a new tab, and payment and personal data are handled by Ko-fi. All features are the same whether or not you donate.

## 🛠️ Development

The current development version is **1.0.12**. The manifest's technical version and the user-facing version are kept identical.

Tests run with Node.js's built-in test runner — no extra packages required.

```powershell
npm test
npm run check
npm run verify:version
```

For a UI preview without real account data, open `dashboard.html?demo=1` from a static server. Organizing, settings, calculations, and deletions in the demo apply only to that page's memory and are kept separate from the extension's real storage.

## 📄 License

Copyright (C) 2026 KuroiineUshina

Distributed under the [GNU General Public License v3.0](LICENSE) or any later version (GPL-3.0-or-later). You may freely use, modify, and redistribute the code, but programs you distribute that modify or include it must also release their source code under the same GPL terms. Versions published up to 1.0.12 were released under the MIT License, and the MIT terms continue to apply to those versions.

The BOOTH and pixiv names and services belong to their respective owners; this project is not an official BOOTH or pixiv product.

- UI icons: [Lucide Icons](https://lucide.dev/) (ISC License, full text in [`assets/lucide/LICENSE`](assets/lucide/LICENSE))
- Fonts: [Paperlogy](https://freesentation.blog/paperlogyfont) for the Korean and English UI, and [M PLUS 1](https://mplusfonts.github.io/) for the Japanese UI. Paperlogy's Latin glyphs are based on Montserrat. Both fonts are bundled inside the extension, so no remote fonts are downloaded. Both are distributed under the SIL Open Font License 1.1; full license texts and sources are in [`assets/paperlogy`](assets/paperlogy) and [`assets/m-plus-1`](assets/m-plus-1).
- Support menu: uses the cup icon from [Ko-fi's official brand assets](https://more.ko-fi.com/brand-assets). The Ko-fi name and logo belong to Ko-fi.
