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
  assert.equal(manifest.version, "1.0.2");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.version_name, "정식 서비스 1.0.1");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ["https://accounts.booth.pm/*"]);
  const policy = manifest.content_security_policy.extension_pages;
  assert.match(policy, /connect-src https:\/\/accounts\.booth\.pm/);
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
    "src/urls.js",
  ];

  await Promise.all(referencedFiles.map((file) => access(path.join(root, file))));

  const dashboard = await readFile(path.join(root, "dashboard.html"), "utf8");
  assert.match(dashboard, /id="clear-local-data"/);
  assert.match(dashboard, /id="data-delete-dialog"/);
  assert.match(dashboard, /id="service-version"[^>]*aria-label="정식 서비스 버전 1\.0\.1"/);
  assert.match(dashboard, /id="theme-toggle"/);
  assert.match(dashboard, /id="red-pill-button"/);
  assert.match(dashboard, /id="red-pill-dialog"/);

  const supportLink = dashboard.match(/<a(?=[^>]*class="support-link")[^>]*>/)?.[0];
  assert.ok(supportLink, "Ko-fi 후원 링크가 있어야 한다");
  assert.match(supportLink, /href="https:\/\/ko-fi\.com\/kuroiineushina"/);
  assert.match(supportLink, /target="_blank"/);
  assert.match(supportLink, /rel="noopener noreferrer"/);
});
