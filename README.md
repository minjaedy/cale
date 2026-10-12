# TEMPO · Own your pace

**[앱 열기 — minjaedy.github.io/cale](https://minjaedy.github.io/cale/)**

블랙·아이스 실버와 오렌지 포인트로 만든 아이폰용 루틴 웹 앱입니다. 웹사이트는 **GitHub Pages**, 로그인과 기록 동기화는 **Firebase**가 담당합니다.

## 배포 구조

| 역할 | 서비스 |
| --- | --- |
| 웹사이트 | `https://minjaedy.github.io/cale/` |
| 소스 | `https://github.com/minjaedy/cale` |
| 웹 배포 | `main`에 push → GitHub Actions → Pages |
| Google 로그인 | Firebase Authentication |
| 동기화 서버 | `cale-b2c40`의 Realtime Database |
| 데이터 경로 | `/tempo/users/{UID}/events`, `/days`, `/meta` |

Google 로그인을 켜고 `minjaedy.github.io`를 인증 허용 도메인에 등록했으며, 데이터베이스 규칙을 게시한 뒤 서버에서 다시 확인했습니다. 이전 Firebase Hosting 주소는 GitHub Pages로 이동합니다. `authDomain`의 Firebase 주소는 인증 처리에 사용되며 앱 접속 주소는 GitHub입니다.

## 아이폰에 앱으로 추가

1. Safari에서 [TEMPO](https://minjaedy.github.io/cale/)를 엽니다.
2. **기록 → Google로 로그인**에서 계정을 선택합니다.
3. **공유 → 홈 화면에 추가**를 선택합니다.

`manifest.webmanifest`, 전용 T 모노그램, Apple Touch 아이콘 180px, 192·512px 설치 아이콘, 1024px 원본과 SVG를 포함합니다. 홈 화면에서 열면 독립 앱 화면으로 표시됩니다. 이미 설치한 옛 아이콘이 남으면 홈 화면 바로가기를 다시 추가하세요.

GitHub Pages에서는 Google 팝업 로그인을 사용합니다. 버튼을 직접 누르고 팝업 차단 안내가 나오면 해당 사이트의 팝업을 허용해 주세요. 교차 사이트 저장소 제약 때문에 단순 리디렉션 로그인으로 바꾸지 마세요.

홈 인디케이터 안전 여백, 16px 입력 글꼴, 키보드에 대응하는 바텀 시트, ‘동작 줄이기’를 지원합니다. 서비스 워커는 오프라인 안내 화면과 아이콘만 보관합니다. 계정 데이터·인증 요청·Firebase 응답은 캐시하지 않습니다. 실제 아이폰 Safari에서의 로그인·홈 화면 설치는 별도 기기 확인이 필요합니다.

## 저장과 보안

- TEMPO 규칙은 **만료일이 없으며**, 로그인한 사용자가 자기 UID 경로만 읽고 쓸 수 있습니다. 익명 계정은 접근할 수 없습니다.
- 날짜별 기록 전체 삭제를 막습니다. 개별 메뉴·몸무게 수정/비우기와 일정 삭제는 가능합니다.
- 기존 `/users/{uid}` 규칙은 그대로 보존했습니다. 강화된 검증·삭제 보호는 `/tempo/users/{uid}`에 적용됩니다.
- TTL·자동 삭제 코드는 없습니다. 관리자나 프로젝트 삭제까지 막는 백업은 아니므로 **기록 백업**으로 JSON 사본을 보관할 수 있습니다.
- 로그인 전 기록은 이 브라우저에만 저장됩니다. 로그인 후 **이 기기 기록 가져오기**를 누르면 서버에 없는 값만 옮깁니다.
- 계정별 로컬 캐시·전송 대기열을 분리합니다. 연결이 끊긴 동안 수정한 내용은 재연결 시 전송합니다. ‘계정에 저장됐어요’가 서버 저장 확인 상태입니다.
- 각 필드만 업데이트하며 같은 필드의 동시 수정은 마지막 쓰기가 적용됩니다.
- 브라우저 데이터를 지우면 서버 미전송 기록은 복구할 수 없습니다. 서로 다른 사이트 주소의 로컬 기록을 자동으로 옮길 수는 없습니다.
- 이 규칙은 각 사용자가 자기 기록을 보관하는 구조이며, 한 사람만 가입 가능한 허용 목록 방식은 아닙니다.

## 개발과 배포

Node.js 22 이상, 규칙 테스트에는 Java 21 이상이 필요합니다.

```sh
npm ci
npm run dev
npm test
npm run test:rules
npm run build
```

웹 변경은 커밋하고 `main`에 push하면 자동 배포됩니다. 수동 재배포는 `npm run deploy:web`입니다. Firebase 규칙·로그인 제공자를 바꿀 때는 인증 후 다음을 실행합니다.

```sh
npx firebase login
npm run deploy:backend
```

규칙만 게시하려면 `npm run deploy:rules`를 사용합니다. 웹 배포가 Firebase 규칙을 대신 게시하지 않습니다. `firebase.json`의 Hosting 설정과 `firebase-redirect/`는 이전 Firebase 주소를 GitHub로 보내는 용도로만 유지합니다.

동기화 로직 테스트 5개와 보안 규칙 테스트 10개가 통과했습니다. 규칙 테스트는 `demo-tempo` 에뮬레이터에서 실행하며 운영 DB에 테스트 기록을 쓰지 않습니다. 웹 클라이언트 설정은 공개 가능하지만 서비스 계정 비밀키나 Admin SDK 인증 JSON은 저장소에 넣지 마세요.

## 공식 참고 자료

- [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [Safari 등에서의 로그인 고려 사항](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Realtime Database 읽기·쓰기](https://firebase.google.com/docs/database/web/read-and-write)
- [Realtime Database 보안 규칙](https://firebase.google.com/docs/database/security/rules-conditions)
