import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAvatarProfileIds,
  buildLiteralSearchVariants,
  buildSearchVariants,
  englishKeyboardToHangul,
  findAvatarProfileIdsInText,
  getAvatarProfileIdByProductId,
  hangulToEnglishKeyboard,
  hiraganaToKatakana,
  katakanaToHangul,
  katakanaToRomaji,
} from "../src/search.js";

test("두벌식 영문 입력과 한글을 양방향으로 변환한다", () => {
  assert.equal(englishKeyboardToHangul("dkqkxk"), "아바타");
  assert.equal(englishKeyboardToHangul("gksrmf"), "한글");
  assert.equal(hangulToEnglishKeyboard("아바타"), "dkqkxk");
  assert.equal(hangulToEnglishKeyboard("ㅡㅐㅐㅜㅣㅑㅅ"), "moonlit");
  assert.equal(buildSearchVariants("dkqkxk").includes("아바타"), true);
});

test("키보드 배치 변환은 검색어에만 적용한다", () => {
  assert.equal(buildSearchVariants("akdi").includes("마야"), true);
  assert.equal(buildLiteralSearchVariants("Misaki").includes("으얀마야"), false);
  assert.deepEqual(buildLiteralSearchVariants("Misaki"), ["misaki"]);
});

test("가타카나 이름을 로마자와 한글 발음 후보로 바꾼다", () => {
  assert.equal(katakanaToRomaji("ミルティナ"), "mirutina");
  assert.equal(katakanaToHangul("ミルティナ"), "미루티나");
  assert.equal(hiraganaToKatakana("しなの"), "シナノ");
});

test("영어·한국어·일본어 아바타 표기를 하나의 자동 검색어로 확장한다", () => {
  for (const query of ["Milltina", "Miltina", "밀티나", "미루티나", "ミルティナ"]) {
    const variants = buildSearchVariants(query);
    assert.equal(variants.includes("ミルティナ"), true, query);
    assert.equal(variants.includes("milltina"), true, query);
    assert.equal(variants.includes("밀티나"), true, query);
  }
});

test("아바타 이름의 부분 입력은 모든 일치 후보를 언어별 표기로 확장한다", () => {
  const hangulVariants = buildSearchVariants("밀");
  assert.equal(hangulVariants.includes("ミルティナ"), true);
  assert.equal(hangulVariants.includes("milltina"), true);

  const latinVariants = buildSearchVariants("mil");
  assert.equal(latinVariants.includes("ミルティナ"), true);
  assert.equal(latinVariants.includes("밀티나"), true);

  const multipleCandidates = buildSearchVariants("미");
  assert.equal(multipleCandidates.includes("海咲"), true);
  assert.equal(multipleCandidates.includes("瑞希"), true);
  assert.equal(multipleCandidates.includes("ミーシェ"), true);
});

test("긴 검색어 안의 아바타 이름을 역방향으로 잘라 인식하지 않는다", () => {
  assert.equal(buildSearchVariants("misaki.").includes("海咲"), true);
  assert.equal(buildSearchVariants("misaki.").includes("舞夜"), false);
  assert.equal(buildSearchVariants("으얀마야").includes("舞夜"), false);
  assert.equal(buildSearchVariants("마야 의상").includes("舞夜"), false);
  assert.equal(buildSearchVariants("마").includes("舞夜"), true);
});

test("한영 키보드 변환 결과 전체에 해당하는 아바타만 인식한다", () => {
  const variants = buildSearchVariants("tlsfk");
  assert.equal(variants.includes("森羅"), true);
  assert.equal(variants.includes("ラシューシャ"), false);
  assert.equal(variants.includes("セレスティア"), false);
  assert.equal(variants.includes("ウルフェリア"), false);
  assert.equal(variants.includes("ミルティナ"), false);
  assert.deepEqual(buildAvatarProfileIds("tlsfk"), ["shinra"]);
});

test("상품 설명에서는 독립된 아바타 이름과 원본 상품 ID만 인식한다", () => {
  assert.deepEqual(findAvatarProfileIdsInText("対応モデル: 海咲 Misaki"), ["misaki"]);
  assert.deepEqual(findAvatarProfileIdsInText("으얀마야 대응"), []);
  assert.deepEqual(findAvatarProfileIdsInText("마야대응"), ["maya"]);
  assert.deepEqual(findAvatarProfileIdsInText("Maya対応"), ["maya"]);
  assert.deepEqual(findAvatarProfileIdsInText("Mayapple asset"), []);
  assert.equal(getAvatarProfileIdByProductId("8325804"), "misaki");
  assert.equal(getAvatarProfileIdByProductId("999999999"), null);
});

test("유명 아바타의 한자·히라가나·영문 표기도 자동으로 연결한다", () => {
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
    ["그루스", "grus"],
    ["Misaki", "海咲"],
    ["미사키", "海咲"],
    ["ミサキ", "海咲"],
  ]);

  for (const [query, expectedVariant] of expectations) {
    assert.equal(buildSearchVariants(query).includes(expectedVariant), true, query);
  }
});

test("사전에 없는 가나도 로마자와 한글 발음으로 자동 확장한다", () => {
  const variants = buildSearchVariants("テストキャラ");
  assert.equal(variants.includes("tesutokyara"), true);
  assert.equal(variants.includes("테스토캬라"), true);
});
