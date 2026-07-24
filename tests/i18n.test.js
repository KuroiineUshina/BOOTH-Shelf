import test from "node:test";
import assert from "node:assert/strict";

import {
  getLocale,
  normalizeLocale,
  resolveLocale,
  setLocale,
  t,
} from "../src/i18n.js";

test("한국어·영어·일본어 표시 언어를 정규화한다", () => {
  assert.equal(normalizeLocale("ko-KR"), "ko");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("ja-JP"), "ja");
  assert.equal(resolveLocale("auto", "ja-JP"), "ja");
  assert.equal(resolveLocale("auto", "fr-FR"), "ko");
});

test("UI 문구와 변수 자리를 선택한 언어로 번역한다", () => {
  setLocale("en");
  assert.equal(getLocale(), "en");
  assert.equal(t("전체 상품"), "All items");
  assert.equal(
    t("언어 변경: 현재 {current}, 다음 {next}", { current: "English", next: "日本語" }),
    "Change language: current English, next 日本語",
  );
  assert.equal(
    t("{count}개 상품을 놓을 폴더를 선택하세요", { count: 3 }),
    "Choose a folder for 3 items",
  );

  setLocale("ja");
  assert.equal(t("무료 상품"), "無料ダウンロード");
  assert.equal(
    t("언어 변경: 현재 {current}, 다음 {next}", { current: "日本語", next: "한국어" }),
    "言語を変更：現在は日本語、次は한국어",
  );
  assert.equal(t("{amount}엔", { amount: "1,000" }), "1,000円");

  setLocale("ko");
  assert.equal(t("전체 상품"), "전체 상품");
});
