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
  assert.equal(
    t("정렬 기준 변경: 현재 {value}", { value: "Purchase order" }),
    "Change sort criterion: currently Purchase order",
  );
  assert.equal(t("카테고리 추가"), "Add category");
  assert.equal(
    t("{name} 폴더 빠른 메뉴", { name: "Avatar" }),
    "Quick actions for the Avatar folder",
  );

  setLocale("ja");
  assert.equal(t("무료 상품"), "無料ダウンロード");
  assert.equal(
    t("정렬 방향 변경: 현재 {value}", { value: "昇順" }),
    "並び替え方向を変更：現在は昇順",
  );
  assert.equal(
    t("언어 변경: 현재 {current}, 다음 {next}", { current: "日本語", next: "한국어" }),
    "言語を変更：現在は日本語、次は한국어",
  );
  assert.equal(t("{amount}엔", { amount: "1,000" }), "1,000円");
  assert.equal(t("카테고리 없음"), "カテゴリーなし");
  assert.equal(
    t("{categories}개 카테고리, {folders}개 폴더, {assignments}개 상품 배치, {favorites}개 즐겨찾기를 복원합니다.", {
      categories: 2,
      folders: 4,
      assignments: 8,
      favorites: 3,
    }),
    "2個のカテゴリー、4個のフォルダー、8件の商品配置、3件のお気に入りを復元します。",
  );

  setLocale("ko");
  assert.equal(t("전체 상품"), "전체 상품");
});
