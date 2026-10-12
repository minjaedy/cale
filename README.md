# TEMPO

[앱 열기](https://minjaedy.github.io/cale/) · [GitHub](https://github.com/minjaedy/cale)

아이폰용 루틴·식단·코칭 앱입니다. 프런트엔드는 GitHub Pages, 인증·기록은 Firebase Spark, 패스키·푸시·예약 알림은 Cloudflare Workers와 D1을 사용합니다.

## 사용

1. Safari에서 앱을 열고 **공유 → 홈 화면에 추가**를 선택합니다.
2. 일반 사용자 또는 트레이너를 선택해 Google로 로그인합니다.
3. 사용자는 **코칭 → 트레이너 연결 → 초대 코드**를 전달하고, 트레이너는 **회원 연결**에 입력합니다. 코드는 24시간 동안 한 번만 사용할 수 있습니다.
4. 사용자가 식단을 등록하면 연결된 트레이너에게, 트레이너가 코멘트를 등록하면 사용자에게 알림이 전송됩니다.
5. **코칭 → 알림·설정 → 알림 켜기**를 각 기기에서 선택합니다. 아이폰은 iOS 16.4 이상 홈 화면 앱에서 알림을 허용해야 합니다.
6. 트레이너는 **Face ID 등록**에서 Google 재인증 후 패스키를 등록합니다. 다음 로그인부터 **Face ID 로그인**을 사용할 수 있습니다. 실제 인증 수단은 기기 설정에 따라 Face ID 또는 기기 암호가 됩니다.

하루·주간 보기의 모든 일정에 개별 완료 체크가 있습니다. 날짜·일정 ID별로 저장하며, 일정 달성률에 반영합니다. 기존 습관 체크 기록은 유지하고, 운동·공부·취침 습관과 연결된 일정의 체크도 함께 반영합니다.

루틴 시작 알림은 등록된 모든 반복 일정에 적용됩니다. 예약 서버가 매분 확인하므로 약 1분의 오차와 푸시 서비스의 지연이 발생할 수 있습니다. 루틴 수정은 Firebase 저장 후 예약 서버에 반영됩니다. 인터넷 연결이 필요합니다.

## 배포 구조

| 역할 | 서비스 |
| --- | --- |
| 앱 | `https://minjaedy.github.io/cale/` |
| 웹 배포 | main push → GitHub Actions → Pages |
| Google·패스키 세션 | Firebase Authentication / cale-b2c40 |
| 기록·코칭 | Firebase Realtime Database |
| 패스키·Web Push·매분 예약 | `https://tempo-coach.couple-private-push.workers.dev` |
| 패스키 공개키·알림 구독·전송 대기 | TEMPO 전용 D1 / tempo-coach |

다른 앱의 서버나 DB를 공유하지 않습니다. Firebase Hosting 주소는 GitHub Pages로 이동합니다. Firebase authDomain은 Google 인증 처리용입니다. Blaze 전환 없이 구성했습니다. 각 서비스의 무료 사용량 한도는 적용됩니다.

## 저장·권한

- 개인 일정과 날짜별 기록: `/tempo/users/{uid}`. 해당 계정만 읽고 쓸 수 있습니다.
- 완료 체크: `/tempo/users/{uid}/days/{date}/completed/{eventId}`. 각 필드만 동기화합니다.
- 코칭: `/tempo/coaching`. 초대를 수락한 연결 관계만 식단·코멘트를 공유합니다. 연결 해제 후 트레이너의 접근·새 알림 전송은 차단됩니다.
- 식단·코멘트는 추가만 가능하며, 일반 클라이언트의 덮어쓰기·삭제를 막습니다. 기록에 만료일은 없습니다.
- 기존 `/users/{uid}` 규칙은 유지합니다. 일정 삭제·개별 기록 수정은 허용하고 날짜별 기록 전체 삭제는 막습니다.
- 서버 인증의 서비스 클레임은 필요한 코칭 경로 읽기만 허용합니다. 개인 기록 전체 조회·데이터 쓰기는 허용하지 않습니다. 루틴 예약 동기화는 요청 사용자의 ID 토큰으로 읽습니다.
- 패스키는 서버에서 일회용 challenge, origin, RP ID, 사용자 확인과 서명을 검증합니다. Firebase의 동일 UID 세션으로 이어집니다.
- 비밀키는 Cloudflare Secrets에만 보관합니다. Firebase 웹 설정은 공개 설정입니다. Admin JSON·개인키·토큰을 GitHub에 넣지 마세요.
- 발송 전에 연결을 재확인하고, 중복 방지·재시도·만료된 구독 정리를 수행합니다. 발송 메타데이터만 7일 후 정리하며 식단·코멘트·루틴 기록은 자동 삭제하지 않습니다.
- 계정별 임시 저장·전송 대기열을 분리합니다. 브라우저 데이터를 지우면 미전송 기록은 사라질 수 있습니다. 기록 화면에서 JSON 백업을 받을 수 있습니다. 관리자·프로젝트 삭제까지 막는 보장은 아닙니다.

## 앱 업데이트

빌드마다 콘텐츠 해시를 만들고 `version.json`을 확인합니다. 앱 복귀·온라인 전환·60초 간격으로 새 버전을 확인하고, 입력·모달·작성 초안·전송 대기가 없을 때 자동 적용합니다. 적용 직전 다시 확인하며, 작성 중이면 배너로 대기합니다. 서비스 워커는 오프라인 안내와 아이콘만 캐시합니다.

## 개발·검증

Node 22.13 이상과 Java 21을 사용합니다.

```sh
npm ci
npm ci --prefix server
npm run dev
npm test
npm run test:rules
npm run test:server
npm run build
npm run build --prefix server
```

로컬 주소는 `http://127.0.0.1:8765/`입니다. 인증 서버는 GitHub origin만 허용하므로 로그인·패스키 최종 확인은 배포 주소에서 합니다. 브라우저 패스키 모듈은 SimpleWebAuthn 14.0.0의 배포용 번들이며 라이선스는 `PASSKEY-LICENSE.md`에 있습니다.

```sh
npm run deploy:rules
npm run deploy:server
git push origin main
```

서버 초기 구성은 `server/wrangler.jsonc`, `server/schema.sql`을 사용합니다. Secrets: `FIREBASE_ACCOUNT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. 재배포 때 기존 VAPID 키와 Firebase 서비스 계정 키를 유지합니다. 키를 변경하면 기존 알림 구독의 재등록이 필요할 수 있습니다.

검증에는 RTDB 에뮬레이터 권한 테스트, 실제 서명을 사용하는 WebAuthn 테스트, 알림 중복·재시도·해제·만료·시간대 테스트를 포함합니다. 배포 서버에서 임시 계정으로 식단·코멘트·루틴 설정·패스키 서명→Firebase UID 연결을 확인한 뒤 테스트 자료를 정리했습니다. 실제 아이폰 Face ID 화면과 잠금화면 푸시 수신은 해당 기기에서 등록·권한 허용 후 확인해야 합니다.
