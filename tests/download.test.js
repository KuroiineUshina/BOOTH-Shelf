import test from "node:test";
import assert from "node:assert/strict";

import { startBoothDownload } from "../src/download.js";

test("검증된 BOOTH 다운로드 주소를 현재 페이지 탐색으로 전달한다", () => {
  const navigations = [];
  const url = startBoothDownload(
    "https://booth.pm/downloadables/7001?variation_id=31#ignored",
    (value) => navigations.push(value),
  );

  assert.equal(url, "https://booth.pm/downloadables/7001?variation_id=31");
  assert.deepEqual(navigations, [url]);
});

test("BOOTH 외부 주소는 탐색 전에 차단한다", () => {
  let navigated = false;
  assert.throws(
    () => startBoothDownload("https://evil.example/downloadables/7001", () => { navigated = true; }),
    /허용되지 않은 다운로드 주소/,
  );
  assert.equal(navigated, false);
});
