# booth-shelf-mcp

[BOOTH Shelf](https://github.com/KuroiineUshina/BOOTH-Shelf) 브라우저 확장프로그램과 AI 도구(Claude Code, Codex 등)를 MCP로 연결합니다. 유니티 작업 중에 AI가 **내가 산 BOOTH 에셋을 검색·추천하고 다운로드**할 수 있습니다. 다운로드는 기본적으로 요청마다 승인합니다.

Connects AI tools (Claude Code, Codex, any MCP client) to your own BOOTH library through the BOOTH Shelf extension. Downloads always require your approval in the browser.

## 설치

필요한 것: Node.js 18 이상, Chrome·Edge 등 Chromium 브라우저에 설치한 BOOTH Shelf 1.0.12 이상, 전체 동기화를 한 번 끝낸 라이브러리.

1. 연결 프로그램을 설치합니다. 현재 사용자 영역에만 등록하므로 관리자 권한이 필요 없습니다. Windows에서는 **시작 메뉴에서 연 터미널이나 PowerShell**에서 실행하세요. Claude Desktop처럼 스토어(MSIX) 앱 안의 터미널에서 실행하면 Windows가 설치 내용을 그 앱 전용 공간으로 옮겨 Chrome이 찾지 못하므로, 설치 프로그램이 이를 감지하면 아무것도 설치하지 않고 안내합니다.
   ```bash
   npx booth-shelf-mcp install
   ```
   웹스토어가 아니라 압축해제로 설치한 확장이면 BOOTH Shelf **설정 → AI 연결 (MCP)**에 표시되는 명령처럼 확장 ID를 붙입니다.
   ```bash
   npx booth-shelf-mcp install --extension-id <확장 ID>
   ```
2. 브라우저를 다시 시작하고 BOOTH Shelf **설정 → AI 연결 (MCP) → AI 연결 켜기**를 누른 뒤 권한을 허용합니다. "연결됐어요"가 표시되면 준비 완료입니다.
3. AI 도구에는 설치할 때 **자동으로 등록**됩니다.
   - **Codex** (CLI·데스크톱 앱): `~/.codex/config.toml`(또는 `CODEX_HOME`)에 `[mcp_servers.booth-shelf]`만 추가하거나 갱신하고, 다른 설정은 그대로 둡니다.
   - **Claude Code**: `claude` 명령이 있으면 `claude mcp add --scope user booth-shelf ...`로 모든 프로젝트에서 쓰도록 등록합니다.
   - 자동 등록을 원하지 않으면 `--no-register`를 붙이세요. 이때는 설치 명령이 직접 추가할 설정을 출력합니다.
   - 등록 후 **Codex나 Claude Code의 새 세션**을 열면 BOOTH 도구가 보입니다.
4. 연결 확인: `npx booth-shelf-mcp status`

설치 폴더는 Windows `%LOCALAPPDATA%\BOOTH Shelf MCP`, macOS `~/Library/Application Support/BOOTH Shelf MCP`, Linux `~/.local/share/booth-shelf-mcp`입니다. 제거는 `npx booth-shelf-mcp uninstall`이며, Codex·Claude Code에 등록한 `booth-shelf`도 함께 지웁니다.

## AI가 쓰는 도구

| 도구 | 하는 일 |
|---|---|
| `booth_status` | 연결 상태와 동기화된 상품 수 |
| `booth_search_library` | 상품명·판매자·파일명·지원 아바타(한·영·일 표기)로 검색, BOOTH 상품 종류(`3D衣装`, `3D outfits`, `3D 의상`)로 필터 |
| `booth_list_files` | 보유 상품의 다운로드 파일 목록 |
| `booth_download` | 파일을 `다운로드/BOOTH Shelf/판매자/상품/`에 받고 작업 번호를 돌려줌 (기본: 승인 창에서 허용한 파일만) |
| `booth_download_status` | 승인 여부, 파일별 진행률, 완료된 파일 경로 |

예: "씬에 있는 아바타가 마누카야. 내가 산 마누카 대응 의상 중에 겨울 느낌인 거 찾아서 받아 줘."

## 동작 방식과 안전장치

```
AI 도구 ─ MCP(stdio) ─ booth-shelf-mcp ─ 로컬 파이프(토큰) ─ 연결 프로그램 ─ Native Messaging ─ BOOTH Shelf 확장 ─ BOOTH
```

- 브라우저가 확장의 AI 연결을 켤 때 연결 프로그램을 실행합니다. 연결 프로그램은 실행마다 무작위 이름의 로컬 파이프와 비밀 토큰을 만들고, 토큰이 맞는 로컬 프로그램만 받아들입니다. 토큰 파일은 현재 사용자 폴더에만 있고 종료 시 삭제됩니다.
- 허용된 요청은 위 다섯 가지뿐이며, 확장이 값 형식과 범위를 다시 검사합니다.
- 다운로드는 기본적으로 요청마다 브라우저 승인 창에서 허용해야 하며, 5분 안에 고르지 않으면 거절됩니다. BOOTH Shelf 설정의 **다운로드할 때마다 승인 창 띄우기**를 끄면 묻지 않고 받습니다. BOOTH 다운로드 주소만 허용하고 주소 자체는 AI에 전달하지 않습니다.
- AI에는 상품명·판매자·종류·지원 아바타·파일명 같은 요약만 전달합니다. 상품 설명 원문, 주문 정보, 로그인 정보는 전달하지 않습니다. 상품명과 파일명은 판매자가 쓴 글이므로 AI에게 "데이터로만 취급하라"고 안내합니다.
- AI 도구가 받은 정보는 그 AI 서비스 제공자에게 전송될 수 있습니다. 자세한 내용은 [개인정보 처리 안내](https://github.com/KuroiineUshina/BOOTH-Shelf/blob/main/PRIVACY.md)를 확인하세요.
- 외부 패키지 의존성이 없습니다(Node.js 기본 모듈만 사용).

BOOTH Shelf와 이 패키지는 pixiv 또는 BOOTH의 공식 제품이 아닙니다.
