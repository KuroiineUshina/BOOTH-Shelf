// BOOTH item categories arrive in Japanese from the public item JSON. Known
// category IDs get Korean/English labels; unknown ones fall back to BOOTH's name.
const CATEGORY_LABELS = Object.freeze({
  41: { ko: "음성 작품 기타", en: "Other audio" },
  126: { ko: "배경 이미지", en: "Background images" },
  127: { ko: "3D 모델 기타", en: "Other 3D models" },
  134: { ko: "소재 기타", en: "Other assets" },
  142: { ko: "게임 관련 상품", en: "Game merchandise" },
  158: { ko: "타월", en: "Towels" },
  188: { ko: "보이스", en: "Voice" },
  201: { ko: "소프트웨어", en: "Software" },
  208: { ko: "3D 캐릭터", en: "3D characters" },
  209: { ko: "3D 의상", en: "3D outfits" },
  210: { ko: "3D 소품", en: "3D props" },
  214: { ko: "3D 텍스처", en: "3D textures" },
  215: { ko: "3D 툴·시스템", en: "3D tools & systems" },
  216: { ko: "3D 모션·애니메이션", en: "3D motion & animation" },
  217: { ko: "3D 액세서리", en: "3D accessories" },
  230: { ko: "3D 헤어", en: "3D hairstyles" },
  231: { ko: "3D 신발", en: "3D shoes" },
});

export function productCategoryLabel(category, locale = "ko") {
  if (!category) return "";
  if (locale === "ja") return category.name;
  return CATEGORY_LABELS[category.id]?.[locale] || category.name;
}

// Every display name of the category, so a search in any UI language finds it.
// The parent ("3Dモデル") is left out: it would match nearly every item.
export function productCategorySearchLabels(category) {
  if (!category?.name) return [];
  return [...new Set(["ko", "en", "ja"].map((locale) => productCategoryLabel(category, locale)))];
}
