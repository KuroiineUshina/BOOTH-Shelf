import { sanitizeDownloadUrl } from "./urls.js";

export function startBoothDownload(value, navigate = (url) => window.location.assign(url)) {
  const url = sanitizeDownloadUrl(value);
  if (!url) {
    throw new Error("허용되지 않은 다운로드 주소를 차단했습니다.");
  }

  navigate(url);
  return url;
}
