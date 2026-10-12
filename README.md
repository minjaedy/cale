# TEMPO · 나만의 속도로, 꾸준하게

아이폰 중심으로 다듬은 다크 루틴 캘린더입니다. 기존 일정과 식단 목표를 유지하고 하루/주간 보기, 완료 체크, 몸무게·식사 기록, Google 로그인, Firebase Realtime Database 동기화를 제공합니다.

## 배포된 상태

- **사용 주소: [TEMPO 열기](https://cale-b2c40.firebaseapp.com/)**
- Firebase Hosting: https://cale-b2c40.web.app/
- GitHub Pages: https://minjaedy.github.io/cale/
- 소스 저장소: https://github.com/minjaedy/cale
- 2026-10-12 Google 로그인 활성화, 위 사이트의 인증 도메인 등록, Realtime Database 규칙 게시를 완료했습니다. 서버 설정을 다시 읽어 일치 여부를 확인했습니다.

- `cale-b2c40` 프로젝트의 웹 앱 설정이 `firebase-config.js`에 입력되어 있습니다.
- 데이터 경로는 `/tempo/users/{Firebase UID}/events`, `/days`, `/meta`입니다.
- `database.rules.json`은 **만료일 없는 규칙**입니다. 로그인한 사용자는 자기 경로만 읽고 쓸 수 있습니다. 익명 로그인은 허용하지 않습니다.
- 날짜별 기록 자체를 삭제하는 요청은 거절합니다. 몸무게/메뉴 개별 수정·비우기와 일정 삭제는 가능합니다.
- 기존 `/users/{uid}` 규칙은 그대로 보존했습니다. TEMPO의 강화된 검증·삭제 보호는 `/tempo/users/{uid}`에 적용됩니다.
- 동기화 로직 테스트 5개와 보안 규칙 테스트 10개가 통과했습니다. 아래 절차는 이후 재설정·재배포용입니다.

## 1. Google 로그인 켜기

1. [Firebase Console — cale-b2c40](https://console.firebase.google.com/project/cale-b2c40/overview)을 엽니다.
2. **Authentication → Sign-in method → Google**을 활성화합니다. 프로젝트 지원 이메일을 선택하고 저장합니다.
3. **Authentication → Settings → Authorized domains**에 배포할 사이트의 호스트를 추가합니다.
   - Firebase Hosting: `cale-b2c40.web.app`, `cale-b2c40.firebaseapp.com`
   - GitHub Pages: `minjaedy.github.io`
   - 로컬 테스트: `localhost`, `127.0.0.1`
4. 호스트만 입력합니다. `https://`나 `/tempo/` 같은 경로는 넣지 않습니다.

기본 사용 주소(`cale-b2c40.firebaseapp.com`)에서는 같은 도메인의 인증 처리 화면을 사용하는 리디렉션 방식으로 로그인합니다. Safari의 교차 사이트 저장소 제약을 피하면서 팝업 없이 로그인할 수 있습니다. GitHub Pages와 `web.app` 주소에서는 팝업 방식을 사용하므로 로그인 버튼을 직접 누르고, 차단 안내가 나오면 해당 사이트의 팝업을 허용합니다.

## 2. Realtime Database 규칙 게시

Firebase Console → **Realtime Database → Rules**에서 `database.rules.json`의 전체 내용을 붙여넣고 **Publish**를 누릅니다. Firestore 규칙 창이 아닙니다.

이 파일은 기존 `/users/{uid}` 규칙을 보존한 해당 DB의 전체 규칙입니다. 다른 앱의 규칙이 추가된다면 함께 병합하세요. TEMPO는 다른 경로의 데이터를 읽거나 수정하지 않습니다.

또는 터미널에서:

```sh
npm ci
npx firebase login
npm run deploy:rules
```

`now < 특정 날짜` 같은 테스트 모드 만료 조건과 TTL/자동 삭제 코드를 넣지 않았습니다. **규칙은 영구 보관을 보증하는 백업이 아닙니다.** 관리자 삭제, 프로젝트 삭제 등은 별개이며, 기록 화면의 **기록 백업** 버튼으로 JSON 사본을 보관할 수 있습니다.

## 3. 웹사이트 배포

### Firebase Hosting

GitHub 저장소는 비공개로 두어도 됩니다. 프로젝트 폴더에서:

```sh
npm ci
npx firebase login
npm run deploy
```

`firebase.json`과 `.firebaserc`는 `cale-b2c40`에 맞춰져 있습니다. 명령은 화면·Google 로그인 제공자·데이터베이스 규칙을 재배포합니다. 새 사이트 주소를 추가하면 Authentication의 허용 도메인도 별도로 등록해야 합니다.

### GitHub Pages

1. 이 프로젝트 파일을 저장소 루트에 업로드합니다. `node_modules`, 로그, 개인 JSON 백업 파일은 업로드하지 않습니다.
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다.
3. **Actions → Deploy TEMPO to GitHub Pages → Run workflow**를 실행합니다.
4. 실행이 성공하면 Pages에 표시된 주소를 사용합니다. Firebase Authentication의 허용 도메인에도 그 주소의 호스트가 필요합니다.

워크플로는 수동 실행으로 설정되어 있습니다. 규칙은 GitHub Pages가 대신 게시하지 않으므로 2단계를 먼저 완료하세요. 비공개 저장소의 Pages 사용 가능 여부는 GitHub 요금제에 따라 다릅니다. Firebase Hosting 방식은 소스 공개 없이 배포할 수 있습니다.

## 아이폰에서 사용하기

위 **사용 주소**를 **Safari**에서 열고 **공유 → 홈 화면에 추가**를 선택하면 TEMPO 아이콘으로 접근할 수 있습니다. HTML 파일 미리보기 대신 HTTPS 사이트 주소를 사용해야 Google 로그인이 동작합니다. 앱의 **기록 → Google로 로그인**을 눌러 PC와 같은 계정으로 로그인하세요. 여러 주소를 번갈아 쓰지 말고 하나를 정해 사용하세요. 로그인 전 기기 기록은 사이트 주소마다 별도로 저장됩니다.

- 320px부터 넓은 화면까지 반응형으로 구성했습니다.
- 홈 인디케이터 안전 여백, 16px 입력 글꼴, 키보드 높이 변화에 대응하는 바텀 시트를 사용합니다.
- ‘동작 줄이기’를 켜면 화면 전환·체크·진행률 애니메이션을 최소화합니다.
- 아이폰 실기기 Safari와 실제 Google 로그인까지 검증된 상태는 아닙니다. 브라우저의 모바일 크기에서 화면과 조작을 확인했습니다.

## 저장 및 동기화

- 로그인 전: 원본과 동일한 `minjae-routine-v8`, `minjae-tracker-v1` 로컬 저장 키를 사용합니다.
- 로그인 후: UID별 로컬 캐시와 서버 경로를 분리하여 다른 계정의 기록이 섞이지 않게 합니다.
- 처음 로그인한 뒤 **이 기기 기록 가져오기**를 누르면 서버에 없는 항목만 옮깁니다. 서버에 같은 일정/날짜의 값이 있으면 서버 값을 보존합니다.
- 한 항목을 바꿀 때 해당 필드만 업데이트하므로 다른 기기에서 기록한 별도 항목을 덮어쓰지 않습니다. 같은 항목을 동시에 수정하면 마지막 서버 쓰기가 적용됩니다.
- 오프라인 중 변경한 내용은 계정별 로컬 대기열에 보관합니다. 앱이 다시 연결되면 재전송합니다. 브라우저 데이터 자체를 지우면 아직 서버에 도착하지 않은 기록은 복구할 수 없습니다.
- 기록 화면에 ‘계정에 저장됐어요’가 표시되어야 서버 저장이 확인된 것입니다. 미전송 기록이 있으면 로그아웃을 막습니다.
- SDK/인증 연결 전 또는 네트워크 오류 시에도 기본 캘린더와 로컬 기록은 사용할 수 있습니다. 오프라인에서 사이트를 처음 여는 기능은 포함하지 않았습니다.
- 원본이 다른 사이트에서 실행되었다면 그 사이트의 localStorage를 새 주소에서 자동으로 읽을 수는 없습니다. 동일한 브라우저라도 사이트 주소가 달라지면 저장 공간이 다릅니다.

## 개발 및 검증

Node.js 22 이상, 보안 규칙 테스트에는 Java 21 이상을 사용합니다.

```sh
npm ci
npm run dev
npm test
npm run test:rules
npm run build
```

- `npm test`: 필드 병합, 오프라인 대기열, 진행 중인 쓰기와 새 수정의 충돌, 일정 차이 계산 등을 검사합니다.
- `npm run test:rules`: `demo-tempo` 에뮬레이터에서 10가지 접근/유효성/삭제 보호·기존 규칙 보존 시나리오를 검사합니다. 운영 DB에는 테스트 데이터를 쓰지 않습니다.
- Firebase 웹 설정은 공개 클라이언트 설정입니다. 서비스 계정 비밀키나 Admin SDK 인증 JSON은 저장소에 넣지 마세요.
- 기본 개인정보 접근 제한은 데이터 경로의 UID와 Firebase 인증 토큰으로 강제됩니다. 이 규칙은 여러 사용자가 각자 자기 기록을 저장하는 구조이며, 한 사람만 가입 가능한 허용 목록 방식은 아닙니다.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | TEMPO 화면, 애니메이션, 로컬 기록 |
| `firebase-config.js` | 제공받은 Firebase 웹 설정 |
| `firebase-sync.js` | Google 로그인, 실시간 동기화, 재전송 대기열 |
| `sync-core.mjs` | 필드 병합·변경 계산 |
| `database.rules.json` | 만료일 없는 계정별 접근 규칙 |
| `firebase.json` | Firebase Hosting/DB 배포 설정 |
| `.github/workflows/pages.yml` | GitHub Pages 수동 배포 |

## 공식 참고 자료

- [Firebase 웹 SDK 설정](https://firebase.google.com/docs/web/setup)
- [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [Safari 등에서의 로그인 고려 사항](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Realtime Database 읽기·쓰기 및 오프라인 제약](https://firebase.google.com/docs/database/web/read-and-write)
- [Realtime Database 보안 규칙](https://firebase.google.com/docs/database/security/rules-conditions)
- [보안 규칙 단위 테스트](https://firebase.google.com/docs/rules/unit-tests)
