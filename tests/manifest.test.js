import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Manifest V3 진입점과 프로젝트 자산이 모두 존재한다", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.0.6");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.version_name, manifest.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, [
    "https://accounts.booth.pm/*",
    "https://booth.pm/*",
  ]);
  const policy = manifest.content_security_policy.extension_pages;
  assert.match(policy, /connect-src https:\/\/accounts\.booth\.pm https:\/\/booth\.pm/);
  assert.match(policy, /img-src 'self' https:\/\/booth\.pximg\.net/);
  assert.match(policy, /object-src 'none'/);
  assert.doesNotMatch(policy, /unsafe-eval|unsafe-inline/);

  const referencedFiles = [
    manifest.background.service_worker,
    manifest.icons["128"],
    manifest.action.default_icon,
    "dashboard.html",
    "styles.css",
    "src/app.js",
    "src/avatar-aliases.js",
    "src/booth.js",
    "src/i18n.js",
    "src/search.js",
    "src/storage.js",
    "src/urls.js",
    "assets/lucide/lucide.woff2",
    "assets/lucide/LICENSE",
    "assets/kofi/kofi-cup.png",
    "assets/paperlogy/Paperlogy-4Regular.ttf",
    "assets/paperlogy/Paperlogy-5Medium.ttf",
    "assets/paperlogy/Paperlogy-6SemiBold.ttf",
    "assets/paperlogy/Paperlogy-7Bold.ttf",
    "assets/paperlogy/Paperlogy-8ExtraBold.ttf",
    "assets/paperlogy/OFL.txt",
    "assets/paperlogy/SOURCE.md",
    "assets/m-plus-1/MPLUS1-Variable.woff2",
    "assets/m-plus-1/OFL.txt",
    "assets/m-plus-1/SOURCE.md",
    ".github/workflows/release.yml",
  ];

  await Promise.all(referencedFiles.map((file) => access(path.join(root, file))));

  const dashboard = await readFile(path.join(root, "dashboard.html"), "utf8");
  assert.match(dashboard, /id="clear-local-data"/);
  assert.match(dashboard, /id="data-delete-dialog"/);
  assert.match(dashboard, /id="export-organization-data"/);
  assert.match(dashboard, /id="import-organization-data"/);
  assert.match(dashboard, /id="organization-backup-file"[^>]*accept="\.json,application\/json"/);
  assert.match(dashboard, /id="organization-restore-dialog"/);
  assert.match(dashboard, /id="add-category"/);
  assert.match(dashboard, /id="context-menu"[^>]*role="menu"/);
  assert.match(dashboard, /id="folder-name-label"/);
  assert.match(dashboard, /id="folder-parent-label"/);
  assert.match(dashboard, /id="confirm-dialog-eyebrow"/);
  assert.match(dashboard, /id="confirm-dialog-title"/);
  assert.match(dashboard, /id="confirm-submit"/);
  assert.match(dashboard, /id="service-version"[^>]*aria-label="버전 1\.0\.6"/);
  assert.match(dashboard, /id="theme-toggle"/);
  assert.match(dashboard, /class="licon licon-sun" id="theme-toggle-icon"/);
  assert.doesNotMatch(dashboard, /id="theme-toggle"[^>]*aria-pressed/);
  assert.match(dashboard, /id="red-pill-button"/);
  assert.match(dashboard, /id="red-pill-dialog"/);
  assert.match(dashboard, /id="sort-kind-toggle"/);
  assert.match(dashboard, /id="sort-direction-toggle"/);
  assert.match(dashboard, /<option value="download">파일명<\/option>/);
  assert.match(dashboard, /id="selection-summary"/);
  assert.match(dashboard, /data-source="free"/);
  assert.match(dashboard, /id="free-count"/);
  assert.match(dashboard, /id="language-toggle"/);
  assert.match(dashboard, /licon-languages/);
  assert.doesNotMatch(dashboard, /id="language-select"/);
  assert.doesNotMatch(dashboard, /class="language-control"/);
  assert.match(dashboard, /id="load-more-sentinel"/);
  assert.doesNotMatch(dashboard, /id="load-more"/);
  assert.doesNotMatch(dashboard, /id="search-suggestions"/);
  assert.doesNotMatch(dashboard, /empty-monogram/);
  assert.match(dashboard, /licon-layout-grid/);
  assert.match(dashboard, /licon-shopping-bag/);
  assert.match(dashboard, /licon-gift/);
  assert.match(dashboard, /licon-star/);
  assert.match(dashboard, /class="brand-mark" src="assets\/icon128\.png"/);
  assert.match(dashboard, /class="support-kofi-icon" src="assets\/kofi\/kofi-cup\.png"/);

  const [
    app,
    booth,
    privacy,
    styles,
    lucideLicense,
    paperlogyLicense,
    mPlusLicense,
    kofiPng,
    releaseWorkflow,
    releaseNotes,
    twitterPost,
  ] = await Promise.all([
    readFile(path.join(root, "src/app.js"), "utf8"),
    readFile(path.join(root, "src/booth.js"), "utf8"),
    readFile(path.join(root, "PRIVACY.md"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
    readFile(path.join(root, "assets/lucide/LICENSE"), "utf8"),
    readFile(path.join(root, "assets/paperlogy/OFL.txt"), "utf8"),
    readFile(path.join(root, "assets/m-plus-1/OFL.txt"), "utf8"),
    readFile(path.join(root, "assets/kofi/kofi-cup.png")),
    readFile(path.join(root, ".github/workflows/release.yml"), "utf8"),
    readFile(path.join(root, "store-assets/RELEASE_NOTES_1.0.5.md"), "utf8"),
    readFile(path.join(root, "store-assets/TWITTER_POST_1.0.5.md"), "utf8"),
  ]);
  const legacyIconGlyphs = /[×▦▣◇☆★＋▰▱□♥↗☰⌕☀☾↻↕←↓›]/u;
  assert.doesNotMatch(`${dashboard}\n${app}`, legacyIconGlyphs);
  assert.match(booth, /credentials:\s*"omit"/);
  assert.match(booth, /isAllowedProductUrl\(response\.url, productId\)/);
  assert.match(privacy, /`https:\/\/booth\.pm\/\*`/);
  assert.match(privacy, /상품 설명 원문[^\n]*저장하지 않습니다/);
  assert.match(app, /className: "item-seller-link"/);
  assert.match(app, /href: item\.sellerUrl/);
  assert.match(app, /target: "_blank"/);
  assert.match(app, /rel: "noopener noreferrer"/);
  assert.match(app, /function playInitialEntryAnimation\(card\)/);
  assert.match(app, /event\.animationName !== "cardReveal"/);
  assert.match(app, /card\.classList\.contains\("is-multi-selected"\) !== selected/);
  assert.match(app, /badge\.textContent !== selectionNumber/);
  assert.match(app, /const POINTER_DRAG_THRESHOLD_PX = 7/);
  assert.match(app, /function handleItemPointerMove\(event\)/);
  assert.match(app, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(dashboard, /id="sort-kind-toggle"/);
  assert.match(dashboard, /id="sort-direction-toggle"/);
  assert.doesNotMatch(dashboard, /data-sort-drag-handle|purchase-sort-select|name-sort-select/);
  assert.match(app, /function toggleSortKind\(\)/);
  assert.match(app, /function toggleSortDirection\(\)/);
  assert.match(app, /function setSortSwitchValue\(/);
  assert.match(app, /refs\["sort-kind-toggle"\]\.addEventListener\("click", toggleSortKind\)/);
  assert.match(styles, /\.sort-switch\s*\{/);
  assert.match(styles, /@keyframes sortWheelOutUp/);
  assert.match(styles, /@keyframes sortWheelInDown/);
  assert.doesNotMatch(styles, /\.sort-control\.is-sort-dragging/);
  assert.match(app, /function cloneCardFrontForDrag\(item\)/);
  assert.match(app, /front\.cloneNode\(true\)/);
  assert.match(app, /event\.clientX - itemDrag\.pointerOffsetX/);
  assert.match(app, /const sidebarRect = refs\.sidebar\.getBoundingClientRect\(\)/);
  assert.match(app, /const horizontalOverlap = verticallyTouchesSidebar/);
  assert.doesNotMatch(app, /shrinkProgress|sidebarScale|--sidebar-drag-scale/);
  assert.match(app, /classList\.toggle\("is-over-sidebar", horizontalOverlap > 0\)/);
  assert.match(app, /clearSelection: draggedCurrentSelection/);
  assert.match(app, /if \(clearSelection\) selectedItemKeys\.clear\(\)/);
  assert.match(app, /const renderedSelection = renderedKeys\.filter\(\(itemKey\) => selectedItemKeys\.has\(itemKey\)\)/);
  assert.match(app, /selectedItemKeys\.size > 1 && renderedSelection\.length/);
  assert.match(styles, /@keyframes dragPreviewGather/);
  assert.match(styles, /\.item-drag-preview\.is-over-sidebar \.item-drag-preview-cluster\s*\{[^}]*opacity:\s*0\.75;[^}]*transform:\s*scale\(0\.75\)/s);
  assert.match(styles, /\.item-drag-preview-cluster\s*\{[^}]*opacity 240ms[^}]*transform 240ms/s);
  assert.doesNotMatch(styles, /selectedCardShake/);
  assert.match(styles, /\.item-card\.is-multi-selected[^}]*transform:\s*translateY\(-5px\)/s);
  const pointerDragStart = app.slice(
    app.indexOf("function beginPointerItemDrag"),
    app.indexOf("function updatePointerDragPosition"),
  );
  assert.doesNotMatch(pointerDragStart, /selectedItemKeys\.(?:clear|add)/);
  assert.doesNotMatch(app, /ITEM_DRAG_MIME/);
  assert.match(styles, /font-family:\s*"Lucide"/);
  assert.match(styles, /assets\/lucide\/lucide\.woff2/);
  assert.match(styles, /assets\/paperlogy\/Paperlogy-4Regular\.ttf/);
  assert.match(styles, /assets\/paperlogy\/Paperlogy-8ExtraBold\.ttf/);
  assert.match(styles, /assets\/m-plus-1\/MPLUS1-Variable\.woff2/);
  assert.match(styles, /--font-ui:\s*"Paperlogy",\s*"M PLUS 1"/);
  assert.match(styles, /:root:lang\(ja\)[\s\S]*--font-ui:\s*"M PLUS 1",\s*"Paperlogy"/);
  assert.match(styles, /body,\s*button,\s*input,\s*select,\s*textarea\s*\{[^}]*font-family:\s*var\(--font-ui\)/s);
  assert.match(styles, /:root:lang\(en\)/);
  assert.match(styles, /:root:lang\(ja\)/);
  assert.match(styles, /font-family:\s*var\(--font-ui\)/);
  assert.doesNotMatch(styles, /Pretendard|Georgia|Times New Roman|ui-monospace/);
  assert.match(lucideLicense, /ISC License/);
  assert.match(paperlogyLicense, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(mPlusLicense, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal(kofiPng[25], 6, "Ko-fi PNG should include an alpha channel");
  assert.match(releaseWorkflow, /assets\/lucide assets\/kofi assets\/paperlogy assets\/m-plus-1/);
  assert.match(releaseWorkflow, /RELEASE_NOTES_\$\{version\}\.md/);
  assert.match(releaseWorkflow, /gh release view/);
  assert.match(releaseWorkflow, /--notes-file "\$notes_file"/);
  assert.match(releaseWorkflow, /gh release upload[^]*--clobber/);
  assert.doesNotMatch(releaseWorkflow, /sha256sum|\.zip\.sha256/);
  assert.doesNotMatch(releaseWorkflow, /assets\/pretendard|assets\/ibm-plex|assets\/gmarket-sans/);
  assert.match(releaseNotes, /백업과 복원/);
  assert.match(releaseNotes, /원통형/);
  assert.match(releaseNotes, /Misaki/);
  assert.match(twitterPost, /#BOOTH_Shelf/);
  assert.match(twitterPost, /chromewebstore\.google\.com\/detail\/aibjhdieagkjmcodaiopaklonjbdmbpj/);
  assert.doesNotMatch(twitterPost, /Shift 다중선택|^#BOOTH$/m);
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /loadNextResultPage/);
  assert.match(app, /className: "item-visual-header"/);
  assert.match(app, /text: t\(assignedFolderIds\.length \? "폴더 관리" : "폴더에 넣기"\)/);
  assert.match(app, /querySelectorAll\('input\[name="assign-folder"\]:checked'\)/);
  assert.match(app, /setItemFolderAssignments\(/);
  assert.match(dashboard, /id="assign-folder-list"/);
  assert.doesNotMatch(dashboard, /id="assign-folder-select"/);
  assert.match(app, /actions\.append\(assignButton, favoriteButton\)/);
  assert.match(app, /const LOCALE_SEQUENCE = Object\.freeze\(\["ko", "en", "ja"\]\)/);
  assert.match(app, /refs\["language-toggle"\]\.addEventListener\("click"/);
  assert.match(app, /const THEME_SEQUENCE = Object\.freeze\(\["light", "dark", "system"\]\)/);
  assert.match(app, /prefers-color-scheme: dark/);
  assert.match(app, /SYSTEM_THEME_MEDIA\?\.addEventListener\("change", handleSystemThemeChange\)/);
  assert.match(styles, /\.licon-monitor::before \{ content: "\\e11d"; \}/);
  assert.match(app, /function exportOrganizationData\(\)/);
  assert.match(app, /function prepareOrganizationRestore\(event\)/);
  assert.match(app, /function confirmOrganizationRestore\(event\)/);
  assert.match(app, /function renderCategory\(category, roots\)/);
  assert.match(app, /function openCategoryContextMenu\(event, categoryId\)/);
  assert.match(app, /function openFolderContextMenu\(event, folderId\)/);
  assert.match(app, /document\.addEventListener\("contextmenu", handleContextMenu\)/);
  assert.match(app, /shouldKeepNativeContextMenu\(event\.target\)/);
  assert.match(app, /deleteCategoryAndReleaseFolders\(/);
  assert.match(app, /download: `booth-shelf-organization-\$\{date\}\.json`/);
  assert.match(styles, /\.licon-languages::before \{ content: "\\e0fe"; \}/);
  assert.match(styles, /html\.is-theme-switching[\s\S]*transition:\s*none !important/);
  assert.match(styles, /\.download-option-list\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*overflow-x:\s*hidden;/s);
  assert.match(styles, /\.download-option\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  assert.match(styles, /\.download-option-copy\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 0;[^}]*overflow:\s*hidden;/s);
  assert.match(styles, /\.download-option-arrow\s*\{[^}]*width:\s*25px;[^}]*flex:\s*0 0 25px;[^}]*margin-left:\s*auto;/s);
  assert.match(styles, /\.folder-category-row\s*\{/);
  assert.match(styles, /\.folder-category-contents\s*\{/);
  assert.match(styles, /\.context-menu\s*\{/);
  assert.doesNotMatch(styles, /\.context-menu-grid\s*\{/);
  assert.match(styles, /\.licon-folder-plus::before \{ content: "\\e0d9"; \}/);
  assert.match(styles, /\.licon-pencil::before \{ content: "\\e1f9"; \}/);
  assert.match(styles, /\.licon-move::before \{ content: "\\e121"; \}/);
  assert.match(styles, /\.licon-trash-2::before \{ content: "\\e18e"; \}/);
  assert.match(app, /label: t\("하위 추가"\),\s*icon: "folder-plus"/s);
  assert.match(app, /label: t\("이름 변경"\),\s*icon: "pencil"/s);
  assert.match(app, /label: t\("이동"\),\s*icon: "move"/s);
  assert.match(app, /label: t\("삭제"\),\s*icon: "trash-2"/s);

  const supportLink = dashboard.match(/<a(?=[^>]*class="support-link")[^>]*>/)?.[0];
  assert.ok(supportLink, "Ko-fi 후원 링크가 있어야 한다");
  assert.match(supportLink, /href="https:\/\/ko-fi\.com\/kuroiineushina"/);
  assert.match(supportLink, /target="_blank"/);
  assert.match(supportLink, /rel="noopener noreferrer"/);
});
