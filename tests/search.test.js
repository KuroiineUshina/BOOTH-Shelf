import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchVariants,
  englishKeyboardToHangul,
  hangulToEnglishKeyboard,
  hiraganaToKatakana,
  katakanaToHangul,
  katakanaToRomaji,
  suggestAvatarSearchTerms,
} from "../src/search.js";

test("두벌식 영문 입력과 한글을 양방향으로 변환한다", () => {
  assert.equal(englishKeyboardToHangul("dkqkxk"), "아바타");
  assert.equal(englishKeyboardToHangul("gksrmf"), "한글");
  assert.equal(hangulToEnglishKeyboard("아바타"), "dkqkxk");
  assert.equal(hangulToEnglishKeyboard("ㅡㅐㅐㅜㅣㅑㅅ"), "moonlit");
  assert.deepEqual(buildSearchVariants("dkqkxk"), ["dkqkxk", "아바타"]);
});

test("가타카나 이름을 로마자와 한글 발음 후보로 바꾼다", () => {
  assert.equal(katakanaToRomaji("ミルティナ"), "mirutina");
  assert.equal(katakanaToHangul("ミルティナ"), "미루티나");
  assert.equal(hiraganaToKatakana("しなの"), "シナノ");
});

test("영문 표기나 한글 발음으로 가타카나 상품명을 제안한다", () => {
  const items = [
    { title: "ミルティナ Casual Set", sellerName: "衣装工房" },
    { title: "別の商品", sellerName: "ショップ" },
  ];

  assert.deepEqual(suggestAvatarSearchTerms("Milltina", items), ["ミルティナ"]);
  assert.deepEqual(suggestAvatarSearchTerms("밀티나", items), ["ミルティナ"]);
  assert.deepEqual(suggestAvatarSearchTerms("ミルティナ", items), []);
});

test("유명 아바타의 한자·히라가나·영문 표기도 한글과 영문으로 찾는다", () => {
  const items = [{
    title: "桔梗・マヌカ・しなの・萌・森羅・セレスティア・Grus対応",
    sellerName: "Avatar Atelier",
  }];

  const expectations = new Map([
    ["Kikyo", "桔梗"],
    ["키쿄", "桔梗"],
    ["Manuka", "マヌカ"],
    ["마누카", "マヌカ"],
    ["Shinano", "しなの"],
    ["시나노", "しなの"],
    ["Moe", "萌"],
    ["모에", "萌"],
    ["신라", "森羅"],
    ["셀레스티아", "セレスティア"],
    ["그루스", "Grus"],
  ]);

  for (const [query, suggestion] of expectations) {
    assert.deepEqual(suggestAvatarSearchTerms(query, items), [suggestion], query);
  }
});

test("선택한 검색 대상에 존재하는 아바타 이름만 제안한다", () => {
  const items = [{
    title: "평범한 의상",
    sellerName: "マヌカ工房",
  }];

  assert.deepEqual(suggestAvatarSearchTerms("manuka", items, { searchField: "title" }), []);
  assert.deepEqual(suggestAvatarSearchTerms("manuka", items, { searchField: "seller" }), ["マヌカ"]);
});
