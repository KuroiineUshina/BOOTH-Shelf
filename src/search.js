import { AVATAR_SEARCH_ALIASES } from "./avatar-aliases.js";

const CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const JUNGSEONG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

const JONGSEONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const ENGLISH_TO_JAMO = {
  r: "ㄱ", R: "ㄲ", s: "ㄴ", e: "ㄷ", E: "ㄸ", f: "ㄹ",
  a: "ㅁ", q: "ㅂ", Q: "ㅃ", t: "ㅅ", T: "ㅆ", d: "ㅇ",
  w: "ㅈ", W: "ㅉ", c: "ㅊ", z: "ㅋ", x: "ㅌ", v: "ㅍ", g: "ㅎ",
  k: "ㅏ", o: "ㅐ", i: "ㅑ", O: "ㅒ", j: "ㅓ", p: "ㅔ",
  u: "ㅕ", P: "ㅖ", h: "ㅗ", y: "ㅛ", n: "ㅜ", b: "ㅠ",
  m: "ㅡ", l: "ㅣ",
};

const JAMO_TO_ENGLISH = {
  "ㄱ": "r", "ㄲ": "R", "ㄳ": "rt", "ㄴ": "s", "ㄵ": "sw", "ㄶ": "sg",
  "ㄷ": "e", "ㄸ": "E", "ㄹ": "f", "ㄺ": "fr", "ㄻ": "fa", "ㄼ": "fq",
  "ㄽ": "ft", "ㄾ": "fx", "ㄿ": "fv", "ㅀ": "fg", "ㅁ": "a", "ㅂ": "q",
  "ㅃ": "Q", "ㅄ": "qt", "ㅅ": "t", "ㅆ": "T", "ㅇ": "d", "ㅈ": "w",
  "ㅉ": "W", "ㅊ": "c", "ㅋ": "z", "ㅌ": "x", "ㅍ": "v", "ㅎ": "g",
  "ㅏ": "k", "ㅐ": "o", "ㅑ": "i", "ㅒ": "O", "ㅓ": "j", "ㅔ": "p",
  "ㅕ": "u", "ㅖ": "P", "ㅗ": "h", "ㅘ": "hk", "ㅙ": "ho", "ㅚ": "hl",
  "ㅛ": "y", "ㅜ": "n", "ㅝ": "nj", "ㅞ": "np", "ㅟ": "nl", "ㅠ": "b",
  "ㅡ": "m", "ㅢ": "ml", "ㅣ": "l",
};

const COMPOUND_MEDIALS = new Map([
  ["ㅗㅏ", "ㅘ"],
  ["ㅗㅐ", "ㅙ"],
  ["ㅗㅣ", "ㅚ"],
  ["ㅜㅓ", "ㅝ"],
  ["ㅜㅔ", "ㅞ"],
  ["ㅜㅣ", "ㅟ"],
  ["ㅡㅣ", "ㅢ"],
]);

const COMPOUND_FINALS = new Map([
  ["ㄱㅅ", "ㄳ"],
  ["ㄴㅈ", "ㄵ"],
  ["ㄴㅎ", "ㄶ"],
  ["ㄹㄱ", "ㄺ"],
  ["ㄹㅁ", "ㄻ"],
  ["ㄹㅂ", "ㄼ"],
  ["ㄹㅅ", "ㄽ"],
  ["ㄹㅌ", "ㄾ"],
  ["ㄹㅍ", "ㄿ"],
  ["ㄹㅎ", "ㅀ"],
  ["ㅂㅅ", "ㅄ"],
]);

const COMPOUND_FINAL_SPLITS = new Map(
  Array.from(COMPOUND_FINALS, ([pair, compound]) => [compound, Array.from(pair)]),
);

const CHOSEONG_INDEX = new Map(CHOSEONG.map((jamo, index) => [jamo, index]));
const JUNGSEONG_INDEX = new Map(JUNGSEONG.map((jamo, index) => [jamo, index]));
const JONGSEONG_INDEX = new Map(JONGSEONG.map((jamo, index) => [jamo, index]));

const CHOSEONG_KEYS = CHOSEONG.map((jamo) => JAMO_TO_ENGLISH[jamo]);
const JUNGSEONG_KEYS = JUNGSEONG.map((jamo) => JAMO_TO_ENGLISH[jamo]);
const JONGSEONG_KEYS = JONGSEONG.map((jamo) => JAMO_TO_ENGLISH[jamo] ?? "");

const KATAKANA_ROMAJI = {
  ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
  カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
  ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
  サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so",
  ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
  タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
  ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do",
  ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
  ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
  バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
  パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
  マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
  ヤ: "ya", ユ: "yu", ヨ: "yo",
  ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
  ワ: "wa", ヰ: "i", ヱ: "e", ヲ: "o", ン: "n", ヴ: "vu",
  ァ: "a", ィ: "i", ゥ: "u", ェ: "e", ォ: "o",
  ャ: "ya", ュ: "yu", ョ: "yo",
  キャ: "kya", キュ: "kyu", キョ: "kyo",
  ギャ: "gya", ギュ: "gyu", ギョ: "gyo",
  シャ: "sha", シュ: "shu", ショ: "sho", シェ: "she",
  ジャ: "ja", ジュ: "ju", ジョ: "jo", ジェ: "je",
  チャ: "cha", チュ: "chu", チョ: "cho", チェ: "che",
  ニャ: "nya", ニュ: "nyu", ニョ: "nyo",
  ヒャ: "hya", ヒュ: "hyu", ヒョ: "hyo",
  ビャ: "bya", ビュ: "byu", ビョ: "byo",
  ピャ: "pya", ピュ: "pyu", ピョ: "pyo",
  ミャ: "mya", ミュ: "myu", ミョ: "myo",
  リャ: "rya", リュ: "ryu", リョ: "ryo",
  ティ: "ti", ディ: "di", トゥ: "tu", ドゥ: "du",
  ファ: "fa", フィ: "fi", フェ: "fe", フォ: "fo",
  ウィ: "wi", ウェ: "we", ウォ: "wo",
  ヴァ: "va", ヴィ: "vi", ヴェ: "ve", ヴォ: "vo",
};

const KATAKANA_HANGUL = {
  ア: "아", イ: "이", ウ: "우", エ: "에", オ: "오",
  カ: "카", キ: "키", ク: "쿠", ケ: "케", コ: "코",
  ガ: "가", ギ: "기", グ: "구", ゲ: "게", ゴ: "고",
  サ: "사", シ: "시", ス: "스", セ: "세", ソ: "소",
  ザ: "자", ジ: "지", ズ: "즈", ゼ: "제", ゾ: "조",
  タ: "타", チ: "치", ツ: "츠", テ: "테", ト: "토",
  ダ: "다", ヂ: "지", ヅ: "즈", デ: "데", ド: "도",
  ナ: "나", ニ: "니", ヌ: "누", ネ: "네", ノ: "노",
  ハ: "하", ヒ: "히", フ: "후", ヘ: "헤", ホ: "호",
  バ: "바", ビ: "비", ブ: "부", ベ: "베", ボ: "보",
  パ: "파", ピ: "피", プ: "푸", ペ: "페", ポ: "포",
  マ: "마", ミ: "미", ム: "무", メ: "메", モ: "모",
  ヤ: "야", ユ: "유", ヨ: "요",
  ラ: "라", リ: "리", ル: "루", レ: "레", ロ: "로",
  ワ: "와", ヰ: "이", ヱ: "에", ヲ: "오", ン: "ㄴ", ヴ: "브",
  ァ: "아", ィ: "이", ゥ: "우", ェ: "에", ォ: "오",
  ャ: "야", ュ: "유", ョ: "요",
  キャ: "캬", キュ: "큐", キョ: "쿄",
  ギャ: "갸", ギュ: "규", ギョ: "교",
  シャ: "샤", シュ: "슈", ショ: "쇼", シェ: "셰",
  ジャ: "자", ジュ: "주", ジョ: "조", ジェ: "제",
  チャ: "차", チュ: "추", チョ: "초", チェ: "체",
  ニャ: "냐", ニュ: "뉴", ニョ: "뇨",
  ヒャ: "햐", ヒュ: "휴", ヒョ: "효",
  ビャ: "뱌", ビュ: "뷰", ビョ: "뵤",
  ピャ: "퍄", ピュ: "퓨", ピョ: "표",
  ミャ: "먀", ミュ: "뮤", ミョ: "묘",
  リャ: "랴", リュ: "류", リョ: "료",
  ティ: "티", ディ: "디", トゥ: "투", ドゥ: "두",
  ファ: "파", フィ: "피", フェ: "페", フォ: "포",
  ウィ: "위", ウェ: "웨", ウォ: "워",
  ヴァ: "바", ヴィ: "비", ヴェ: "베", ヴォ: "보",
};

const suggestionIndexCache = new WeakMap();

function composeHangul(initial, medial, final = "") {
  const initialIndex = CHOSEONG_INDEX.get(initial);
  const medialIndex = JUNGSEONG_INDEX.get(medial);
  const finalIndex = JONGSEONG_INDEX.get(final) ?? 0;
  if (initialIndex === undefined || medialIndex === undefined) {
    return `${initial ?? ""}${medial ?? ""}${final ?? ""}`;
  }
  return String.fromCodePoint(0xac00 + ((initialIndex * 21) + medialIndex) * 28 + finalIndex);
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();
}

export function englishKeyboardToHangul(value) {
  let output = "";
  let initial = null;
  let medial = null;
  let final = null;

  const flush = () => {
    if (initial && medial) output += composeHangul(initial, medial, final ?? "");
    else output += `${initial ?? ""}${medial ?? ""}${final ?? ""}`;
    initial = null;
    medial = null;
    final = null;
  };

  for (const character of String(value ?? "").normalize("NFC")) {
    const jamo = ENGLISH_TO_JAMO[character];
    if (!jamo) {
      flush();
      output += character;
      continue;
    }

    const isVowel = JUNGSEONG_INDEX.has(jamo);
    if (isVowel) {
      if (!initial && !medial) {
        initial = "ㅇ";
        medial = jamo;
        continue;
      }
      if (initial && !medial) {
        medial = jamo;
        continue;
      }
      if (medial && !final) {
        const compound = COMPOUND_MEDIALS.get(`${medial}${jamo}`);
        if (compound) {
          medial = compound;
        } else {
          flush();
          initial = "ㅇ";
          medial = jamo;
        }
        continue;
      }

      const splitFinal = COMPOUND_FINAL_SPLITS.get(final);
      if (splitFinal) {
        const [remainingFinal, nextInitial] = splitFinal;
        output += composeHangul(initial, medial, remainingFinal);
        initial = nextInitial;
      } else {
        const nextInitial = final;
        output += composeHangul(initial, medial);
        initial = CHOSEONG_INDEX.has(nextInitial) ? nextInitial : "ㅇ";
      }
      medial = jamo;
      final = null;
      continue;
    }

    if (!initial) {
      initial = jamo;
      continue;
    }
    if (!medial) {
      output += initial;
      initial = jamo;
      continue;
    }
    if (!final && JONGSEONG_INDEX.has(jamo)) {
      final = jamo;
      continue;
    }
    if (final) {
      const compound = COMPOUND_FINALS.get(`${final}${jamo}`);
      if (compound) {
        final = compound;
        continue;
      }
    }
    flush();
    initial = jamo;
  }

  flush();
  return output;
}

export function hangulToEnglishKeyboard(value) {
  let output = "";

  for (const character of String(value ?? "").normalize("NFC")) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
      const syllableIndex = codePoint - 0xac00;
      const initialIndex = Math.floor(syllableIndex / 588);
      const medialIndex = Math.floor((syllableIndex % 588) / 28);
      const finalIndex = syllableIndex % 28;
      output += CHOSEONG_KEYS[initialIndex];
      output += JUNGSEONG_KEYS[medialIndex];
      output += JONGSEONG_KEYS[finalIndex];
      continue;
    }
    output += JAMO_TO_ENGLISH[character] ?? character;
  }

  return output;
}

export function buildSearchVariants(value) {
  const raw = String(value ?? "").normalize("NFC");
  return Array.from(new Set([
    normalizeSearchText(raw),
    normalizeSearchText(englishKeyboardToHangul(raw)),
    normalizeSearchText(hangulToEnglishKeyboard(raw)),
  ].filter(Boolean)));
}

function compact(value) {
  return normalizeSearchText(value).replace(/[\s\p{P}\p{S}]+/gu, "");
}

function transliterateKatakana(value, table) {
  const characters = Array.from(value);
  let output = "";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === "ー") continue;
    if (character === "ッ") {
      const pair = `${characters[index + 1] ?? ""}${characters[index + 2] ?? ""}`;
      const next = table[pair] ?? table[characters[index + 1]] ?? "";
      if (table === KATAKANA_ROMAJI && next) output += next[0];
      continue;
    }

    const pair = `${character}${characters[index + 1] ?? ""}`;
    if (table[pair]) {
      output += table[pair];
      index += 1;
    } else {
      output += table[character] ?? "";
    }
  }

  return output;
}

export function katakanaToRomaji(value) {
  return transliterateKatakana(String(value ?? ""), KATAKANA_ROMAJI);
}

export function katakanaToHangul(value) {
  return transliterateKatakana(String(value ?? ""), KATAKANA_HANGUL);
}

export function hiraganaToKatakana(value) {
  return Array.from(String(value ?? ""), (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x3041 && codePoint <= 0x3096) {
      return String.fromCodePoint(codePoint + 0x60);
    }
    return character;
  }).join("");
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1),
      ));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarityScore(query, candidate) {
  if (!query || !candidate) return 0;
  if (query === candidate) return 120;
  if (query.length >= 3 && (candidate.startsWith(query) || query.startsWith(candidate))) {
    return 96 - Math.abs(candidate.length - query.length);
  }
  const distanceLimit = query.length >= 7 ? 2 : query.length >= 4 ? 1 : 0;
  if (distanceLimit && Math.abs(query.length - candidate.length) <= distanceLimit) {
    const distance = levenshtein(query, candidate);
    if (distance <= distanceLimit) return 80 - distance;
  }
  return 0;
}

function addSuggestionCandidate(candidates, suggestion, aliases = []) {
  const forms = candidates.get(suggestion) ?? new Set();
  const kana = hiraganaToKatakana(suggestion);
  forms.add(compact(suggestion));
  forms.add(compact(katakanaToRomaji(kana)));
  forms.add(compact(katakanaToHangul(kana)));
  for (const alias of aliases) forms.add(compact(alias));
  forms.delete("");
  candidates.set(suggestion, forms);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function valueContainsTerm(value, term) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedValue || !normalizedTerm) return false;
  if (/^[a-z0-9][a-z0-9 _-]*$/iu.test(normalizedTerm)) {
    const matcher = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}($|[^a-z0-9])`,
      "iu",
    );
    return matcher.test(normalizedValue);
  }
  return normalizedValue.includes(normalizedTerm);
}

function buildSuggestionIndex(items, searchField) {
  const candidates = new Map();
  for (const item of items) {
    const values = searchField === "title"
      ? [item.title]
      : searchField === "seller"
        ? [item.sellerName]
        : [item.title, item.sellerName];

    for (const value of values) {
      const rawValue = String(value ?? "");
      for (const match of rawValue.matchAll(/[ァ-ヺー]{2,}|[ぁ-ゖー]{2,}/gu)) {
        addSuggestionCandidate(candidates, match[0]);
      }

      for (const avatar of AVATAR_SEARCH_ALIASES) {
        const matchedTerm = avatar.terms.find((term) => valueContainsTerm(rawValue, term));
        if (matchedTerm) {
          addSuggestionCandidate(candidates, matchedTerm, [
            ...avatar.terms,
            ...avatar.aliases,
          ]);
        }
      }
    }
  }
  return candidates;
}

function suggestionIndexForItems(items, searchField) {
  if (!Array.isArray(items)) return new Map();
  const normalizedField = ["all", "title", "seller"].includes(searchField) ? searchField : "all";
  let byField = suggestionIndexCache.get(items);
  if (!byField) {
    byField = new Map();
    suggestionIndexCache.set(items, byField);
  }
  if (!byField.has(normalizedField)) {
    byField.set(normalizedField, buildSuggestionIndex(items, normalizedField));
  }
  return byField.get(normalizedField);
}

export function suggestAvatarSearchTerms(query, items, { searchField = "all", limit = 3 } = {}) {
  const rawQuery = normalizeSearchText(query);
  if (rawQuery.length < 2) return [];

  const queryForms = new Set();
  for (const variant of buildSearchVariants(rawQuery)) {
    queryForms.add(compact(variant));
    for (const token of variant.split(/\s+/u)) {
      if (token.length >= 2) queryForms.add(compact(token));
    }
  }

  const scored = [];
  for (const [term, candidateForms] of suggestionIndexForItems(items, searchField)) {
    if (queryForms.has(compact(term))) continue;

    let score = 0;
    for (const queryForm of queryForms) {
      for (const candidateForm of candidateForms) {
        score = Math.max(score, similarityScore(queryForm, candidateForm));
      }
    }
    if (score) scored.push({ term, score });
  }

  return scored
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term, "ja"))
    .slice(0, Math.max(1, limit))
    .map(({ term }) => term);
}

export const suggestJapaneseSearchTerms = suggestAvatarSearchTerms;
