# ENGEDI SELECT · 클라우드 관리자 연결용 프론트엔드

이 폴더는 공개 가능한 프론트엔드만 포함합니다. `public/`를 기존 GitHub 저장소의 같은 위치에 반영합니다.
상품·메인화면은 Supabase에서 읽습니다. 관리자에서 저장한 변경은 별도 GitHub 업로드 없이 반영됩니다.
**DB 스키마·관리자 계정·관리자 권한·상품 이관이 끝나기 전에는 배포하지 마세요.** 아직 자동 배포하지 않았습니다.

- Render Static Site: Build `true`, Publish Directory `public`, Auto Deploy `Off`.
- 기존 Render 서비스는 `render.yaml`을 업로드하는 것만으로 헤더가 바뀌지 않을 수 있습니다. Headers 탭에서 CSP의 `connect-src`와 `img-src`에 같은 Supabase URL이 허용되는지 확인하세요.
- 관리자 주소: 공개 사이트의 `/admin.html`. Supabase Auth에 등록하고 `select_admins`에 지정한 계정만 상품을 수정할 수 있습니다.
- `site-config.js`에는 공개용 publishable/anon 키만 들어 있습니다. service_role·secret 키·비밀번호는 넣지 않습니다.
- 별도로 생성한 `-migration-private` 폴더는 GitHub·Render·공개 파일 업로드 대상이 아닙니다.
- 문의 접수와 결제는 이 출시에서 연결하지 않습니다. 상품 소개와 관리자 상품/메인 편집만 사용합니다.
- 기존 PC의 원본 상품·사진·비밀번호·문의 데이터는 변경하지 않았습니다.

관리자 저장 후 다른 휴대폰에서 상품을 열어 확인한 뒤 출시 완료를 판단하세요. 연결 실패 시 기존 정적 사이트로 되돌릴 수 있도록 현재 GitHub 커밋을 보관하세요.
