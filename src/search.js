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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildBaseSearchVariants(value) {
  const raw = String(value ?? "").normalize("NFC");
  const variants = new Set([
    normalizeSearchText(raw),
    normalizeSearchText(englishKeyboardToHangul(raw)),
    normalizeSearchText(hangulToEnglishKeyboard(raw)),
  ].filter(Boolean));

  for (const match of raw.matchAll(/[ァ-ヺー]{2,}|[ぁ-ゖー]{2,}/gu)) {
    const kana = hiraganaToKatakana(match[0]);
    variants.add(normalizeSearchText(kana));
    variants.add(normalizeSearchText(katakanaToRomaji(kana)));
    variants.add(normalizeSearchText(katakanaToHangul(kana)));
  }

  variants.delete("");
  return [...variants];
}

export function buildLiteralSearchVariants(value) {
  return buildBaseSearchVariants(value);
}

let avatarSearchData;

function getAvatarSearchData() {
  if (avatarSearchData) return avatarSearchData;

  const latinTerms = new Map();
  const nonLatinTermsByFirstCharacter = new Map();
  const partialTerms = [];
  const seenPartialTerms = new Set();
  const expandedProfiles = AVATAR_SEARCH_ALIASES.map((avatar, profileIndex) => {
    const names = [...avatar.terms, ...avatar.aliases];
    const variants = new Set();

    for (const name of names) {
      for (const variant of buildBaseSearchVariants(name)) variants.add(variant);
      const normalizedName = normalizeSearchText(name);
      if (!normalizedName) continue;
      const partialKey = `${profileIndex}:${normalizedName}`;
      if (!seenPartialTerms.has(partialKey)) {
        seenPartialTerms.add(partialKey);
        partialTerms.push({ term: normalizedName, profileIndex });
      }
      if (/^[a-z0-9][a-z0-9 _-]*$/u.test(normalizedName)) {
        const profileIndexes = latinTerms.get(normalizedName) ?? [];
        profileIndexes.push(profileIndex);
        latinTerms.set(normalizedName, profileIndexes);
      } else {
        const firstCharacter = Array.from(normalizedName)[0];
        const entries = nonLatinTermsByFirstCharacter.get(firstCharacter) ?? [];
        entries.push({ term: normalizedName, profileIndex });
        nonLatinTermsByFirstCharacter.set(firstCharacter, entries);
      }
    }
    return [...variants];
  });

  const alternatives = [...latinTerms.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  const latinPattern = alternatives.length
    ? new RegExp(`(?:^|[^a-z0-9])(${alternatives.join("|")})(?=$|[^a-z0-9])`, "giu")
    : null;

  avatarSearchData = {
    expandedProfiles,
    latinPattern,
    latinTerms,
    nonLatinTermsByFirstCharacter,
    partialTerms,
  };
  return avatarSearchData;
}

function matchingAvatarProfileIndexes(values) {
  const {
    latinPattern,
    latinTerms,
    nonLatinTermsByFirstCharacter,
    partialTerms,
  } = getAvatarSearchData();
  const matches = new Set();

  for (const value of values) {
    const normalizedValue = normalizeSearchText(value);
    if (!normalizedValue) continue;
    const partialQueries = new Set([
      normalizedValue,
      ...(normalizedValue.match(/[\p{L}\p{N}]+/gu) ?? []),
    ]);

    for (const partialQuery of partialQueries) {
      for (const { term, profileIndex } of partialTerms) {
        if (term.includes(partialQuery)) matches.add(profileIndex);
      }
    }

    if (latinPattern) {
      latinPattern.lastIndex = 0;
      for (const match of normalizedValue.matchAll(latinPattern)) {
        for (const profileIndex of latinTerms.get(normalizeSearchText(match[1])) ?? []) {
          matches.add(profileIndex);
        }
      }
    }

    for (const firstCharacter of new Set(Array.from(normalizedValue))) {
      for (const { term, profileIndex } of nonLatinTermsByFirstCharacter.get(firstCharacter) ?? []) {
        if (normalizedValue.includes(term)) matches.add(profileIndex);
      }
    }
  }

  return matches;
}

export function buildSearchVariants(value) {
  const raw = String(value ?? "").normalize("NFC");
  const variants = new Set(buildBaseSearchVariants(raw));
  const { expandedProfiles } = getAvatarSearchData();
  for (const profileIndex of matchingAvatarProfileIndexes([raw, ...variants])) {
    for (const variant of expandedProfiles[profileIndex]) variants.add(variant);
  }

  return [...variants];
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
