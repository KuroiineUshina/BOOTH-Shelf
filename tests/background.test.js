import test from "node:test";
import assert from "node:assert/strict";

let actionHandler;
const openedTabs = [];

globalThis.chrome = {
  action: {
    onClicked: {
      addListener(listener) {
        actionHandler = listener;
      },
    },
  },
  tabs: {
    create(options) {
      openedTabs.push(options);
    },
  },
  runtime: {
    getURL(path) {
      return `chrome-extension://test-extension-id/${path}`;
    },
  },
};

await import("../background.js");

test("백그라운드 진입점이 확장 아이콘 동작을 등록한다", () => {
  assert.equal(typeof actionHandler, "function");
});

test("확장 아이콘을 누르면 대시보드를 연다", () => {
  actionHandler();
  assert.deepEqual(openedTabs, [{
    url: "chrome-extension://test-extension-id/dashboard.html",
  }]);
});
