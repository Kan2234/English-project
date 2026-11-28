# Ôn TOEIC

Website luyện thi TOEIC Listening & Reading (Vite + React + TypeScript). Dữ liệu đề thi, audio và tài liệu nằm trong [`database/`](database/README.md).

## Chạy

```powershell
npm install
```

```powershell
npm run dev
```

Mở http://localhost:5173. Lệnh `dev` và `build` tự chép `database/toeic.json` và `database/audio/` vào `public/data/` trước khi chạy.

```powershell
npm run build
```

Kết quả nằm trong `dist/`. Đây là site tĩnh, dùng `HashRouter` và đường dẫn tương đối, nên có thể đưa lên bất kỳ host tĩnh nào (Netlify, Vercel, GitHub Pages, Nginx...) mà không cần cấu hình rewrite.

## Kiểm thử

```powershell
npm run lint            # oxlint: lỗi code, quy tắc React hooks và TypeScript (.oxlintrc.json)
npm run typecheck       # tsc --noEmit (TypeScript 7)
npm test                # Vitest: tests/unit (chấm điểm, localStorage, Leitner, Worker, dữ liệu)
npm run test:coverage   # như trên, kèm độ phủ; dưới ngưỡng trong vitest.config.ts thì báo lỗi
npm run e2e             # Playwright: tests/e2e, chạy vào site đang chạy (mặc định http://127.0.0.1:8081)
```

- Lint dùng [oxlint](https://oxc.rs) thay cho ESLint: typescript-eslint chưa chạy được với TypeScript 7.0 (bản 7.0 chưa có compiler API).
- Báo cáo độ phủ nằm trong `coverage/`, báo cáo E2E trong `playwright-report/`, trace và ảnh chụp khi test lỗi trong `test-results/`. Các thư mục này không được commit.
- `E2E_BASE_URL` đổi site cần kiểm tra, ví dụ bản staging trên Cloudflare.
- Chạy `npm run e2e` ngay trên máy (ngoài Docker) thì lần đầu cần `npx playwright install` để tải trình duyệt.
- Test chậm (phát audio thật) được gắn `@slow`: bỏ qua bằng `npm run e2e -- --grep-invert @slow`.

**Chạy E2E trong Docker vào staging trên máy.** Image Playwright phải cùng phiên bản với `@playwright/test` (1.57.0). Trên Docker Desktop cho Windows, `--network host` không dùng được, nên container gọi về máy qua `host.docker.internal`. Lệnh dưới đây chép mã sang `/app` trong container rồi mới `npm ci`, để `node_modules` bản Linux không ghi đè `node_modules` trên máy, sau đó chép báo cáo về lại thư mục repo.

```powershell
npm run deploy:staging   # build và chạy staging tại http://127.0.0.1:8081
docker run --rm --ipc=host -v "${PWD}:/src" -e E2E_BASE_URL=http://host.docker.internal:8081 mcr.microsoft.com/playwright:v1.57.0-noble sh -c 'mkdir /app && cd /src && tar -cf - package.json package-lock.json playwright.config.ts tests src | tar -xf - -C /app && cd /app && npm ci --ignore-scripts --no-audit --no-fund && npx playwright test; rc=$?; rm -rf /src/test-results /src/playwright-report; cp -r test-results playwright-report /src/; exit $rc'
```

Thêm `--project=chromium` (hoặc `firefox`, `webkit`, `mobile-375`, `tablet-768`) sau `npx playwright test` để chạy một trình duyệt. Xem báo cáo: `npx playwright show-report`.

### CI trên GitHub

Mỗi PR vào `staging` hoặc `main` chạy `.github/workflows/ci.yml` (không deploy, không dùng secret nên PR từ fork cũng chạy an toàn):

- `checks / lint`, `checks / typecheck`, `checks / unit` (kèm độ phủ), `checks / data` (`db:build` và `database/toeic.json` đã commit phải khớp với nguồn), `checks / build` (JS đầu không quá 400 kB). Các job này nằm trong `_checks.yml`, sau này `staging.yml` dùng lại.
- `secrets`: Gitleaks quét các commit của PR.
- `deps`: osv-scanner trên `package-lock.json` và `npm audit --audit-level=high` (gồm cả devDependencies). Muốn chấp nhận một lỗ hổng thì thêm vào `osv-scanner.toml` kèm lý do và `ignoreUntil`, không bỏ qua hàng loạt.
- `sast`: CodeQL (`security-extended`). Kết quả nằm ở tab Security; ruleset chặn merge khi có cảnh báo. `.github/workflows/codeql.yml` chạy cùng phân tích đó mỗi lần push vào `staging`/`main` (và mỗi tuần trên `main`), để nhánh đích luôn có kết quả mới nhất: cảnh báo mới được tính cho đúng PR gây ra nó, thay vì chỉ lộ ra ở Release PR.
- `container`: hadolint, `docker build` và Trivy, chỉ chạy khi PR đổi `deploy/`, `.dockerignore` hoặc `.trivyignore`. Ngoại lệ ghi trong `.trivyignore`, có lý do và `exp:`.
- `ci-ok`: gom kết quả các job trên. Ruleset chỉ yêu cầu **một** check này; job bị bỏ qua (skipped) vẫn tính là đạt, job lỗi hay bị hủy thì `ci-ok` đỏ.

Mọi action được pin theo SHA. Kiểm tra workflow trên máy trước khi push (cần Docker):

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
docker run --rm -v "${PWD}/.github:/repo/.github:ro" -w /repo ghcr.io/zizmorcore/zizmor:1.32.0@sha256:3014cc8f68f663935f69b3c3e0e41f5ce102b268d97db13db0f62208747f860d --offline .github/workflows
```

#### Staging tự động

Mỗi lần push (tức merge PR) vào `staging`, `.github/workflows/staging.yml` chạy (cũng bấm tay được trong tab Actions, nhưng chỉ deploy từ nhánh `staging`):

- `checks / …`: chạy lại lint, typecheck, unit, data và build như CI. Bản `dist` build ở đây chính là bản được deploy, không build lại.
- `deploy`: `wrangler deploy --env staging` lên Worker riêng `english-project-staging` (wrangler theo `package-lock.json`, token chỉ nằm trong Environment `staging`). Job chỉ xong khi site đã phục vụ đúng bản vừa build.
- Sau đó chạy song song vào https://english-project-staging.leminhkhang2234.workers.dev:
  - `verify-site`: `scripts/check-site.mjs`, phải đạt hết (hiện 64/64).
  - `e2e`: Playwright đủ 5 project trong image `mcr.microsoft.com/playwright:v1.57.0-noble`. Có PulseAudio (null sink) để Firefox phát được audio, nên test thi thật cũng chạy trên Firefox.
  - `dast`: OWASP ZAP baseline (chỉ quét thụ động, spider 2 phút). Cảnh báo High hoặc Medium làm job đỏ, trừ những rule đã hạ mức trong `.zap/rules.tsv` (mỗi rule một dòng lý do). Bộ lọc nằm ở `scripts/zap-gate.mjs`.
- `summary`: bảng kết quả, rồi đặt commit status **`staging/verified`**: xanh khi `deploy`, `verify-site`, `e2e` và `dast` đều đạt, ngược lại thì đỏ. Ruleset của `main` yêu cầu status này, nên Release PR từ `staging` vào `main` chỉ merge được khi commit đó đã qua staging. Lượt chạy bị hủy thì không đặt status.
- Mỗi lúc chỉ một lượt chạy. Push mới **xếp hàng** chứ không hủy lượt đang chạy, để không bao giờ dừng giữa lúc deploy hay để staging chạy một bản chưa ai kiểm tra.

Xem kết quả: tab **Actions** → lượt chạy `staging` (bảng tóm tắt ở trang Summary), **Environments → staging** (lịch sử deploy và link site), commit trên nhánh `staging` (dấu `staging/verified`). Artifact của lượt chạy: `playwright-report`, `test-results` (trace, ảnh khi lỗi) và `zap-report` (HTML/JSON/MD).

Chạy ZAP giống CI vào staging trên máy (báo cáo nằm trong `zap-out/`, không commit):

```powershell
mkdir zap-out; copy .zap\rules.tsv zap-out\
docker run --rm -v "${PWD}/zap-out:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:2.17.0@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af zap-baseline.py -t http://host.docker.internal:8081 -c rules.tsv -m 2 -I -J report.json -r report.html
node scripts/zap-gate.mjs zap-out/report.json .zap/rules.tsv
```

#### Phát hành production

Production (Worker `english-project`, https://english-project.leminhkhang2234.workers.dev) **chỉ** được deploy khi có tag `vX.Y.Z` trên `main`. Push hay merge vào `main` không deploy gì.

Các bước phát hành:

1. Gom thay đổi vào `staging` (PR, squash). Chờ `staging.yml` xanh, tức commit có dấu `staging/verified`.
2. Mở **Release PR** từ `staging` vào `main`, ghi changelog trong mô tả, merge bằng **merge commit**.
3. Tạo tag SemVer trên đúng merge commit đó (commit mới nhất của `main`):

   ```powershell
   git fetch origin; git tag -s v1.2.3 origin/main -m "v1.2.3"; git push origin v1.2.3
   ```

   Hoặc dùng "Draft a new release" trên GitHub, chọn tag mới và target `main`. Tag `v*` không xóa hay dời được, nên kiểm tra kỹ số phiên bản trước khi push.
4. `.github/workflows/production.yml` chạy:
   - `gate` (`scripts/release-gate.mjs`): tên tag đúng `vX.Y.Z` (không nhận `-rc`, `-beta`...); tag nằm trên lịch sử first-parent của `main`; commit đó là merge commit, có parent thứ hai (`^2`) nằm trên `staging`, mang status `staging/verified` = success do `github-actions[bot]` đặt, và **cây file giống hệt** `^2`. Nói cách khác, production nhận đúng từng byte mà staging đã kiểm tra. Tag đặt thẳng lên một commit của `staging` (kiểu fast-forward) bị từ chối, vì như vậy có thể deploy một bản staging cũ chưa từng qua Release PR.
   - `release / …` (`_release.yml`, Environment `production`): ở đây workflow **dừng chờ duyệt**. Vào tab Actions → lượt chạy → **Review deployments** → chọn `production` → **Approve and deploy**. Sau đó job build lại đúng commit của tag, ghi lại version đang chạy, `wrangler deploy` (version được gắn tag và message `release vX.Y.Z`), chờ site phục vụ bản mới, rồi smoke test: `check-site` (64/64) và Playwright `@smoke` trên Chromium (trang chủ, mở một đề, phát một file audio, trang kết quả, audio Range).
   - Smoke lỗi thì **tự rollback** về version trước, chờ API báo version đó đang chạy, chờ site phục vụ lại bản cũ, chạy lại `check-site`, rồi mở issue nhãn `incident`. Lượt chạy đó tính là **thất bại** dù rollback thành công.
   - `publish` (chỉ khi release xanh): tạo **GitHub Release** từ tag, release notes tự sinh, đính kèm `dist.tar.gz` (chính bản `dist` đã deploy, không build lại; đóng gói tất định: cùng `dist` thì cùng sha256), `dist.tar.gz.sha256` và SBOM CycloneDX `sbom.cdx.json` (syft 1.57.1, từ `package-lock.json`, chỉ gồm thư viện chạy trong site). `dist.tar.gz` có **build provenance** ký bằng Sigstore.
5. Kiểm tra provenance của file đã tải về:

   ```powershell
   gh release download v1.2.3 -R Kan2234/English-project -p dist.tar.gz
   gh attestation verify dist.tar.gz -R Kan2234/English-project
   ```

   Lệnh thành công nghĩa là file được build bởi workflow `production.yml` của repo này, từ đúng commit của tag.

Xem kết quả: trang Summary của lượt chạy (bảng version trước/sau, rollback hay không), **Environments → production** (lịch sử deploy), tab Releases. Artifact `release-smoke-vX.Y.Z` chứa báo cáo Playwright.

**Rollback bằng tay** (`.github/workflows/rollback.yml`): tab Actions → `rollback` → **Run workflow**. Ở ô "Use workflow from" chọn **tag** phát hành mới nhất (`vX.Y.Z`), không chọn nhánh, vì Environment `production` chỉ nhận tag `v*`. Điền `reason` (bắt buộc; ký tự đặc biệt bị lọc trước khi ghi vào message trên Cloudflare) và `version_id` (để trống = version chạy trước version hiện tại; nếu deployment hiện tại đã là một lần rollback thì workflow từ chối và in bảng các deployment gần nhất để bạn chọn version ID). Cần Approve như lúc phát hành. Workflow rollback, chờ API xác nhận, chạy `check-site`, ghi tóm tắt. Muốn deploy lại nguyên một bản phát hành cũ thì vào lượt chạy `production` của tag đó và bấm **Re-run all jobs** (gate và bước duyệt chạy lại; GitHub Release đã có thì giữ nguyên). Workflow này chỉ bấm được khi file đã có trên `main`.

**Diễn tập rollback** (`.github/workflows/drill.yml`): chạy trên một Worker riêng `english-project-drill` (`env.drill` trong `wrangler.jsonc`), dùng Environment `staging`, không đụng production. Workflow deploy bản A, rồi deploy bản B và cố ý cho smoke "lỗi", kiểm tra B được rollback đúng về A và đã xác minh, kiểm tra issue `incident` + `drill` được mở, rồi tự đóng issue đó và **xóa Worker drill**. Chạy tự động mỗi khi push vào `staging` có đổi `_release.yml`, `drill.yml`, `production.yml`, `rollback.yml`, `scripts/cf-versions.mjs`, `scripts/check-site.mjs`, `wrangler.jsonc` hoặc `package-lock.json` (nâng wrangler có thể đổi định dạng output mà script đọc), và bấm tay được từ nhánh `staging`. Drill đỏ thì issue drill được để mở; sửa trước khi phát hành bản tiếp theo. Không dùng tag `v0.0.0-drill` vì tag `v*` ở repo này không xóa được.

**Hotfix** cũng đi qua `staging`: tách `fix/…` từ `staging`, PR vào `staging`, chờ `staging/verified`, Release PR vào `main`, tag bản patch. Gate yêu cầu `staging/verified` và cây file giống `staging`, nên một PR sửa thẳng vào `main` không phát hành được.

**Khi auto-rollback xảy ra:**

1. Mở issue `incident` mà workflow vừa tạo: có tag, version trước/sau, rollback đã xác minh hay chưa, link lượt chạy.
2. Nếu "Rollback verified" là `true`: production đang chạy bản cũ và đã qua `check-site`. Xem log smoke (artifact `release-smoke-vX.Y.Z`) để tìm nguyên nhân.
3. Nếu rollback lỗi hoặc chưa xác minh: chạy `rollback.yml` ngay, hoặc vào Cloudflare dashboard → Worker → Deployments → chọn version trước → Rollback. Sau đó chạy `npm run check-site -- https://english-project.leminhkhang2234.workers.dev`.
4. Sửa qua `staging` như hotfix, phát hành bản patch kế tiếp (không dùng lại tag đã hỏng), rồi viết postmortem ngắn trong issue và đóng nó.

Các script dùng cho phát hành: `scripts/cf-versions.mjs` (mọi lệnh wrangler về version: version đang chạy, rollback, chờ xác nhận, xóa Worker drill; đã kiểm với wrangler 4.159.0 và 4.162.0; mỗi lần nâng wrangler, `drill.yml` chạy lại để kiểm chứng) và `scripts/release-gate.mjs`. Unit test của chúng nằm trong `tests/unit/`.

#### Quét hằng đêm và Dependabot

`.github/workflows/scheduled.yml` chạy mỗi đêm lúc 02:17 giờ Việt Nam, không deploy, không dùng secret:

- `site-prod`, `site-staging`: `check-site` vào production và staging.
- `deps`: osv-scanner và `npm audit` trên `package-lock.json`. Lockfile không đổi nhưng cơ sở dữ liệu lỗ hổng thì có, nên đây là chỗ bắt CVE mới.
- `container`: build site, `docker build -f deploy/Dockerfile`, Trivy (base image không pin digest và có `apk upgrade`, nên mỗi đêm quét đúng base hiện tại).
- `dast-prod`: ZAP baseline vào production, cùng `.zap/rules.tsv` và `scripts/zap-gate.mjs` như staging.
- `secrets-history`: Gitleaks quét **toàn bộ** lịch sử mọi nhánh và tag, chỉ đêm Chủ nhật (hoặc khi bấm tay có tick `weekly`).
- `report`: mỗi job đỏ có **một** issue `Scheduled: <job> failing`, nhãn `scheduled` (xem tab Issues, lọc `label:scheduled`). Đêm sau còn đỏ thì thêm comment; xanh lại thì issue tự comment và đóng. Logic nằm trong `scripts/scheduled-report.mjs` (có unit test).

GitHub chỉ chạy `schedule` từ nhánh mặc định, nên workflow này bắt đầu chạy hằng đêm sau lần phát hành đưa nó vào `main`. Bấm tay (Actions → `scheduled` → Run workflow) từ nhánh khác `main` là chạy thử: `report` chỉ in ra việc nó sẽ làm. Repo public không có hoạt động 60 ngày thì GitHub tắt schedule (runbook `schedule-bi-tat.md`).

**Dependabot** (`.github/dependabot.yml`): mỗi thứ Hai mở PR nâng phiên bản cho npm (minor/patch gộp trong nhóm `npm-minor`, major tách riêng), action (nhóm `actions`, giữ dạng pin SHA + `# vX.Y.Z`) và base image Docker (nhóm `docker`). PR mở vào **`staging`**, chạy `ci.yml` như mọi PR khác; bạn tự bấm **Squash and merge** (không dùng lệnh `@dependabot merge`: push do bot tạo không nhận secret của Environment, deploy staging sẽ lỗi), rồi thay đổi đi tiếp qua `staging.yml`, Release PR và tag. Chỉ đề xuất bản đã ra ít nhất 14 ngày (`cooldown`). Security update của Dependabot luôn mở PR vào `main` và không merge được ở đó; làm lại qua `staging` theo runbook CVE. Tool binary pin bằng sha256, image Playwright/ZAP và `@playwright/test` cập nhật tay theo runbook `cap-nhat-pin-thu-cong.md`.

**Runbook** cho các sự cố (production lỗi, lộ token, CVE, xoay token, tag nhầm, job đêm đỏ, cập nhật pin, diễn tập rollback, schedule bị tắt): [`docs/runbooks/`](docs/runbooks/README.md).

`.github/CODEOWNERS` ghi `@Kan2234` là chủ các đường dẫn về pipeline và hạ tầng. Hiện chỉ mang tính thông tin: repo có một người duy trì, nên "Require review from Code Owners" trong ruleset phải để tắt (tác giả không tự duyệt PR của mình được).

#### Làm việc với AI agent

Agent (Claude Code và các agent con) chỉ sửa code, chạy kiểm tra nhanh trên máy và mở PR. Agent **không** deploy, không tạo tag, không duyệt deployment, và không tự chạy `check-site`, Playwright hay ZAP vào staging/production: các bước đó do `staging.yml` và `production.yml` làm, agent chỉ đọc kết quả (`gh pr checks`, `gh run view --log-failed`, status `staging/verified`, issue `scheduled`/`incident`). Nhờ vậy một đợt phát hành không còn tốn token cho việc agent dựng staging, kiểm tra từng trang và đọc nguyên log. Quy tắc và bảng lệnh nằm trong [`CLAUDE.md`](CLAUDE.md).

## Triển khai (Docker + nginx, chạy trên máy)

Phần này chỉ để chạy và thử site trên máy, **không** thuộc quy trình phát hành: production và staging thật trên Cloudflare chỉ do GitHub Actions deploy.

Cần Docker. Quy trình gồm ba bước: lên staging, kiểm tra, rồi mới lên production.

```powershell
npm run deploy:staging      # build dist/, build image nginx, chạy tại http://127.0.0.1:8081 và tự kiểm tra
npm run deploy:production   # kiểm tra lại staging, rồi chạy CHÍNH image đó tại http://localhost
npm run deploy:rollback     # quay về image production trước đó
npm run check-site -- http://127.0.0.1:8081   # chạy riêng bộ kiểm tra
```

- Production không build lại mà gắn tag mới (`on-ta-web:production`) cho đúng image đã kiểm tra trên staging. Image production cũ được giữ ở tag `on-ta-web:previous` để rollback.
- `scripts/check-site.mjs` có 64 kiểm tra: trang và tài nguyên tải được, mọi file audio/ảnh trong `toeic.json` đều có, audio tua được (HTTP 206), header bảo mật (CSP, nosniff, X-Frame-Options...), chặn path traversal, không lộ dotfile, không liệt kê thư mục, chỉ cho phép GET/HEAD. Có bất kỳ kiểm tra nào trượt thì không lên production.
- Container chạy với filesystem chỉ đọc, bỏ hết Linux capability (chỉ giữ 4 quyền nginx cần) và giới hạn RAM/tiến trình. Production tự khởi động lại cùng Docker (`--restart unless-stopped`).
- Mặc định production chỉ mở cho chính máy này (`127.0.0.1:80`). Muốn máy khác trong mạng LAN truy cập: `$env:ONTA_PROD_BIND = '0.0.0.0:80'; npm run deploy:production`.
- Cấu hình nằm trong `deploy/` (`Dockerfile`, `nginx.conf`, `security-headers.conf`).

## Triển khai trên Cloudflare Workers

Worker `english-project` (https://english-project.leminhkhang2234.workers.dev) chỉ được deploy bởi GitHub Actions, theo cấu hình trong `wrangler.jsonc`: production khi có tag `vX.Y.Z` (xem "Phát hành production"), staging (`env.staging`) khi push vào `staging`, Worker diễn tập (`env.drill`) bởi `drill.yml`. Workers Builds đã được ngắt, nên push vào `main` không deploy gì.
- `public/_headers` gắn header bảo mật và cache cho file tĩnh. Nội dung phải giống `deploy/security-headers.conf`.
- `worker/index.js` chỉ xử lý `/data/audio/*`. Static assets của Cloudflare không hỗ trợ `Range`, nên Worker này tự trả `206 Partial Content` để trình duyệt tua được audio. Worker cũng tự gắn header bảo mật, vì `_headers` không áp dụng cho response do Worker tạo ra.
- Đường dẫn sai trả lỗi 404 thật với trang `public/404.html`.
- Chạy thử trên máy: Smart App Control của Windows chặn `workerd.exe` (file không có chữ ký số), nên phải chạy `wrangler dev` trong Docker:

  ```bash
  docker run --rm -p 127.0.0.1:8787:8787 -v "$PWD:/src:ro" node:24-bookworm-slim sh -c 'apt-get update -qq && apt-get install -y -qq ca-certificates >/dev/null && mkdir /app && cd /src && tar --exclude=./node_modules --exclude=./.git -cf - . | tar -xf - -C /app && cd /app && npm ci && npx wrangler dev --ip 0.0.0.0 --port 8787'
  ```

  Chạy `npm run build` trước để có `dist/`.

## Cập nhật dữ liệu

```powershell
npm run db:build
```

```powershell
npm run db:audio
```

`db:build` kiểm tra và build lại database từ `database/data/`. `db:audio` sinh lại audio cho những câu Nghe đã thay đổi. Sau đó chạy lại `npm run dev`.

## Tính năng

| Trang | Đường dẫn | Nội dung |
|---|---|---|
| Trang chủ | `#/` | Danh sách đề, câu Part 5 làm thử ngay, lịch sử bài đã nộp |
| Giới thiệu đề | `#/de/:testId` | Chọn làm cả bài, chỉ Nghe hoặc chỉ Đọc; làm tiếp bài dở |
| Làm bài | `#/de/:testId/lam-bai/:scope` | Đồng hồ đếm ngược, audio tự phát theo nhóm câu, phiếu trả lời để chuyển câu, tự lưu, tự nộp khi hết giờ |
| Kết quả | `#/ket-qua/:id` | Điểm quy đổi thang 990, trình độ CEFR, đúng/sai theo Part, xem lại kèm transcript và giải thích |
| Luyện theo phần | `#/luyen-tap/part-N` | Làm từng nhóm câu của một Part, có đáp án ngay |
| Từ vựng | `#/tu-vung` | Lọc theo chủ đề và mức điểm, nghe phát âm, ẩn nghĩa để tự kiểm tra, đánh dấu đã thuộc |
| Ngữ pháp | `#/ngu-phap/:slug` | 13 chủ điểm, bẫy thường gặp, câu Part 5 liên quan để luyện |
| Về kỳ thi | `#/ky-thi` | Cấu trúc đề, thang điểm, mẹo làm bài |

Bài làm, kết quả và tiến độ chỉ lưu trong `localStorage` của trình duyệt. Chưa có tài khoản hay đồng bộ giữa các máy.

## Cấu trúc mã

```
src/
├── lib/          types.ts (kiểu dữ liệu), data.tsx (tải toeic.json), exam.ts (chấm điểm, thời gian), storage.ts (localStorage)
├── components/   QuestionBlock (ô tròn A–D), Stimulus (audio, ảnh, đoạn văn, biểu đồ), AnswerSheet, AudioPlayer, Layout
├── pages/        Home, TestIntro, Exam, ResultPage, Practice, PracticeIndex, VocabPage, GrammarPage, InfoPage
└── styles.css    toàn bộ style; màu và cỡ chữ khai báo ở :root
```
