import test from "node:test";
import assert from "node:assert/strict";

import { AVATAR_SEARCH_ALIASES } from "../src/avatar-aliases.js";

test("주요 아바타 사전은 여러 문자권의 공식 표기와 별칭을 포함한다", () => {
  assert.ok(AVATAR_SEARCH_ALIASES.length >= 65);

  const allTerms = new Set(AVATAR_SEARCH_ALIASES.flatMap((avatar) => avatar.terms));
  for (const expected of [
    "ミルティナ", "しなの", "マヌカ", "桔梗", "萌", "愛莉",
    "セレスティア", "森羅", "舞夜", "ライム", "まめひなた",
    "キプフェル", "ルルネ", "瑞希", "ルミナ", "マリシア",
    "真冬", "あのん", "ミーシェ", "ソラハ", "Nardoragon",
  ]) {
    assert.ok(allTerms.has(expected), `${expected} 표기가 사전에 있어야 한다`);
  }

  for (const avatar of AVATAR_SEARCH_ALIASES) {
    assert.ok(avatar.terms.length >= 1);
    assert.equal(new Set(avatar.terms).size, avatar.terms.length);
    assert.equal(new Set(avatar.aliases).size, avatar.aliases.length);
    assert.ok([...avatar.terms, ...avatar.aliases].every((value) => value.trim().length > 0));
  }
});
