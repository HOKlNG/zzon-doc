# wiki.json + 문서 md 규약 (정본)

> zzon-wiki의 모든 상태는 `<출력폴더>/wiki.json` **한 파일**이 단일 소스다.
> build-wiki.mjs가 이 형태를 strict 검증하고, 사이트(index.html)는 이 트리만 읽어 렌더한다.
> 카탈로그(doc-catalog.md)는 **템플릿**일 뿐 — 런타임엔 wiki.json에 인스턴스화된 트리만 존재한다.

## 핵심 원칙

1. **todo 문서는 파일을 만들지 않는다.** wiki.json 엔트리로만 존재한다(`file: null`). 빈 md 무덤 금지.
2. **사람 수정이 정본.** 스킬은 `hash`로 사람 수정(edited-by-human)을 감지하면 절대 자동 덮어쓰기하지 않고, 재독 후 반영 여부를 묻는다.
3. **상태는 wiki.json 단일 소유.** md에는 frontmatter/status를 두지 않는다 (드리프트 방지).
4. **로그는 이중화하지 않는다.** `history[]`가 유일한 로그이고, 사람이 읽는 로그는 빌드된 사이트의 "진행 현황" 페이지가 렌더한다.

## wiki.json 구조

```jsonc
{
  "version": 1,
  "title": "데모숍 개발 문서",
  "tier": "standard",                      // "lite" | "standard" | "full"
  "createdAt": "2026-07-05T11:00:00+09:00",
  "updatedAt": "2026-07-05T14:20:00+09:00",
  "interview": {
    "projectMode": "existing",             // "existing"(역문서화) | "greenfield"(신규)
    "excludedSections": [
      { "id": "design", "reason": "디자인은 Figma에서 별도 관리" }
    ],
    "decisions": [                         // 범위를 결정한 문답 — 재진입 시 재질문 방지
      { "ts": "2026-07-05T11:05:00+09:00", "q": "티어?", "a": "standard" }
    ]
  },
  "sections": [                            // ★ 인스턴스화된 nav 트리 (최대 3단)
    {
      "code": "05",                        // "00".."11" (doc-catalog.md 순서)
      "id": "architecture",                // slug — 라우트/디렉터리 세그먼트
      "title": "아키텍처 설계",
      "purpose": "시스템·인프라 구조와 기술 선택을 정의한다.",
      "items": [ /* DocNode[] */ ]
    }
  ],
  "questions": [                           // 질문 대장 (정규화)
    {
      "id": "q-001",                       // ^q-\d{3,}$ , 전역 유일
      "doc": "architecture/context",       // 트리 경로 (sectionId/slug[/slug])
      "text": "외부 PG는 토스 단일인가, 복수 연동 예정인가?",
      "status": "open",                    // "open" | "answered" | "dropped"
      "askedAt": "2026-07-05T13:10:00+09:00",
      "answer": null,                      // answered면 필수
      "answeredAt": null
    }
  ],
  "history": [                             // append-only, 최신이 뒤. 200개 초과 시 앞에서 잘림
    { "ts": "2026-07-05T11:05:00+09:00", "actor": "skill", "action": "init",
      "note": "tier=standard, 섹션 9개 승인" },
    { "ts": "2026-07-05T13:10:00+09:00", "actor": "skill", "action": "draft",
      "docs": ["architecture/context"], "note": "코드 스캔 초안 + 질문 1건" },
    { "ts": "2026-07-05T14:20:00+09:00", "actor": "human", "action": "edited",
      "docs": ["data/logical-erd"], "note": "빌드 시 해시 불일치 감지" }
  ]
}
```

### DocNode (sections[].items[] — children으로 재귀, 최대 3단)

```jsonc
{
  "slug": "context",                 // ^[a-z0-9][a-z0-9_-]*$ , 같은 부모 안에서 유일
  "title": "시스템 컨텍스트",
  "summary": "시스템과 외부 행위자.", // 문서 목적 한 줄 (nav·카드에 노출)
  "tier": 1,                         // 1(라이트) | 2(표준) | 3(풀) — 카탈로그에서 상속
  "status": "done",                  // "todo" | "draft" | "done" | "na"
  "naReason": null,                  // status="na"면 필수 (왜 해당 없음인지)
  "file": "docs/architecture/context.md",  // draft·done이면 필수, todo·na면 null
  "diagrams": ["context"],           // manifest.json의 다이어그램 slug 참조 (없으면 [])
  "source": "code",                  // "code"(스캔) | "interview"(문답) | "mixed"
  "hash": "sha256:9f2c…",            // 스킬/빌드가 마지막으로 동기화한 md의 sha256
  "syncedAt": "2026-07-05T13:10:00+09:00",
  "questions": ["q-001"],            // 이 문서에 걸린 질문 id (대장에 존재해야 함)
  "children": []                     // 동일 구조 재귀
}
```

### 검증 규칙 (build-wiki.mjs가 강제 — 실패 시 `path: 메시지`)

- `version` = 1, `title` 필수, `tier` ∈ lite|standard|full
- 섹션 id·문서 slug는 slug 정규식, 트리 경로 전역 유일
- `status="na"` → `naReason` 필수 / `status ∈ draft|done` → `file` 필수 / `status ∈ todo|na` → `file`은 null
- `diagrams[]`의 slug는 manifest.json에 존재해야 함 (manifest가 없으면 다이어그램 참조 자체가 에러 — build-docs 먼저)
- `questions` 대장: id 유일, `doc` 경로가 트리에 존재, answered면 `answer` 필수
- DocNode의 `questions[]` id는 대장에 존재해야 함
- `file` 경로는 `docs/` 하위 상대 경로여야 함

## 문서 md 규약

- **raw HTML 금지.** 본문 전체가 이스케이프된 뒤 마크다운 변환된다 — `<script>`를 써도 텍스트로 보인다.
- 지원 문법: `#`~`####` 제목, 문단, `-`/`1.` 목록, ``` 코드펜스, 인라인 코드, **굵게**, *기울임*, [링크](url), `>` 인용, `|` 표, `---` 구분선.
- 링크 스킴 허용목록: `https?:`, `#`(사이트 내 해시 라우트), 상대경로. `javascript:`/`data:`는 텍스트로 강등된다.
- **H1은 쓰지 않는다** — 페이지 제목은 wiki.json의 `title`이 렌더한다. 본문은 `##`부터.

### 다이어그램 임베드

한 줄 단독으로:

```
@diagram(context)
```

빌드 타임에 iframe 블록(+ 캡션 + "크게 보기" 링크)으로 치환된다. slug가 manifest.json에 없으면 **빌드 에러 + 사용 가능한 slug 목록** 출력.

### 미확인 지점 콜아웃 (질문 앵커)

답을 못 받은 지점은 본문에 반드시 이 형태로 남긴다:

```
> ❓ 미확인(q-001): 외부 PG는 토스 단일인가, 복수 연동 예정인가?
```

- `q-NNN`은 wiki.json 질문 대장의 id와 일치해야 한다.
- build-wiki가 마커↔대장을 대조한다: **마커는 사라졌는데 질문이 open이면** "사람이 본문에서 답했을 가능성"으로 리포트 → 재진입 시 확인 질문으로 승격.

## 저작 자가질문 (스킬이 문서 하나를 끝낼 때마다)

1. 코드에서 못 읽은 값을 **추측으로 채운 문장이 없나?** (모르면 ❓ 콜아웃 + 질문 대장)
2. 미확인 지점마다 **질문 앵커(q-NNN)를 남겼나?** wiki.json 대장과 id가 맞나?
3. todo 문서에 **빈 md 파일을 만들지 않았나?**
4. 아키텍처류 문서라면 **다이어그램을 zzon-doc 절차로 그려 임베드했나?** (직접 HTML 금지)
5. status·hash를 wiki.json에 반영했나? (빌드를 돌리면 자동)
