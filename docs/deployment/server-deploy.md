> 正式 Linux 交付请以 [Linux交付说明](linux-handoff.md) 为准。本文早期 phase1 的演示seed/默认配置不用于客户生产环境。

# 服务端部署说明

## 本地服务器启动

```bash
npm run prepare:release-env -- --admin-email ops@example.com --base-url https://fund.example.com
# 按需补充 .env 中的 QWEN_API_KEY；脚本已生成强 SESSION_SECRET、ADMIN_PASSWORD、POSTGRES_PASSWORD 和 RELEASE_WRITE_MARKER。
npm run evidence:phase1 -- --release-env-file .env --base-url https://fund.example.com
```

## 发布前门禁

合并或部署前，GitHub Actions `CI` 必须通过。该门禁会执行：

- 前端依赖安装、测试和构建。
- API 依赖安装、测试和构建。
- 备份、恢复、发布验收和 Phase 1 审计脚本语法检查。
- 发布前环境 preflight 和 Compose 一键发布脚本语法检查。
- 前端构建后执行 `check:client-secrets`，确认浏览器源码和 `dist` 中没有 provider 客户端密钥访问或疑似明文 key。
- 启动已构建 API，并执行只读 `verify:release`。
- 使用 `postgres:16` service 和 `APP_AUTH_MODE=password` 执行登录、迁移、seed、写入版 `verify:release --write`、API 重启后按同一 marker 读取任务、资料归档、AI 收件箱归档、会议确认、报告导出、资金确认和募集签署、`backup:db`、`restore:db`，并对恢复库再跑同一 marker 验收。
- 使用 Docker Compose 构建并启动 `postgres`、`api`、`web`、`nginx`，经 Nginx 入口执行迁移、seed、health check、写入版 `verify:release --write` 和恢复库同 marker 验收。

CI 不替代服务器验收；Docker Compose、目标服务器 PostgreSQL 重启持久化、目标服务器备份恢复仍必须在正式环境执行。

## 无 git remote 的发布包交付

当前 checkout 如果没有配置 git remote，不能验证 `git push` 或远端拉取部署。此时可先生成不含本地密钥、不含构建产物和不含证据目录的源码发布包，用于把同一提交转移到目标服务器：

```bash
npm run package:release
```

默认输出到 gitignored 的 `release-packages/`，包含：

- `fund-management-fund-phase1-<commit>-<time>.tar.gz`：由 `git archive` 生成，只包含已提交源码。
- `fund-management-fund-phase1-<commit>-<time>.manifest.json`：记录 branch、commit、`workingTreeClean`、`archiveSha256` 和目标服务器部署命令。

正式交付前应在干净工作区执行。仅本地诊断时才使用：

```bash
npm run package:release -- --allow-dirty-worktree
```

发布包传到服务器后，先核对 manifest 里的 `archiveSha256`，再解包并按本文档执行 `prepare:release-env`、`preflight:release`、`deploy:compose`、`drill:restore:compose` 和 `audit:phase1`。发布包是无 remote 时的交付兜底，不等同于已经完成 git remote / CI / 服务器部署 handoff。

## 发布前环境检查

`deploy:compose` 会自动先执行 Compose 模式 preflight。目标服务器先生成正式 `.env`：

```bash
npm run prepare:release-env -- --admin-email ops@example.com --base-url https://fund.example.com
```

该脚本会在 `.env` 中写入 `RELEASE_WRITE_MARKER`，并把文件权限固定为 `0600`。如需固定发布批次编号，可传入 `--write-marker phase1-2026-06-11`。
`preflight:release` 会检查 `--release-env-file` 是否被 git 跟踪；正式密钥文件必须使用 `.env` / `.env.*` 这类已忽略路径，或放在仓库外部。

若只想先看环境缺口，在目标服务器配置 `.env` 后执行：

```bash
npm run preflight:release -- --compose --release-env-file .env
```

该命令会检查 Docker Compose、部署文件、正式密码模式配置、数据库连接路径、备份恢复工具、Qwen key、源码交付路径和 git 工作区状态。源码交付路径可以是已配置 git remote，也可以是 `package:release` 生成发布包。默认遇到发布阻断项会返回非 0；dirty worktree 会被阻断，只有本地诊断或应急恢复时才使用 `--allow-dirty-worktree` 覆盖。只想查看结果时可执行：

```bash
npm run preflight:release -- --release-env-file .env --soft --json
```

不带 `--compose` 且 `.env` 配置了正式 `DATABASE_URL` 时，preflight 会按直连 PostgreSQL 模式检查 `pg_dump`、`pg_restore` 和 `psql`；Docker / Docker Compose 缺失只作为警告，不阻断直连数据库发布检查。`audit:phase1` 的目标工具检查也使用同一口径。

## Phase 1 总审计

目标服务器完成环境变量配置、Compose 发布和恢复演练后，执行：

```bash
npm run audit:phase1 -- --release-env-file .env --base-url https://fund.example.com
```

如果已经执行过 `deploy:compose -- --write`，把发布命令输出的 `Write marker` 传入最终审计：

```bash
npm run audit:phase1 -- --release-env-file .env --base-url https://fund.example.com --expect-write-marker "<write-marker>"
```

也可以在 `.env` 中写入 `RELEASE_EXPECT_WRITE_MARKER` 或 `RELEASE_WRITE_MARKER`，最终审计会从同一个 `--release-env-file` 自动读取 marker。

该命令会汇总检查 Phase 1 交付文件、npm 脚本、CI 门禁、Compose 配置、前端 API 迁移、客户端密钥暴露、服务器工具链、正式环境变量和运行中 API。前端 API 迁移审计会确认 AI 前端只调用 `/api/ai/chat` 与 `/api/ai/settings`，Vite 只做 `/api/ai` 代理，不在浏览器侧或 Vite 配置里保留 provider 直连和密钥读取逻辑；同时确认业务状态 localStorage 只在显式 local mode 启用，server/degraded 模式下关键写入不会回落到本地内存，任务主线、资料上传、报告流程、AI 收件箱和会议确认页面不再透传或绕过 command handler。运行中 API 审计会读取基金详情、项目详情、任务、资料、AI 收件箱、会议、报告、资金和审计账本；传入 `--expect-write-marker` 时，还会调用 `verify:release --expect-write-marker` 验证同一发布 marker 下的写入记录仍可读。最终审计前先执行 `npm run build`，让审计脚本扫描最新 `dist`。若只想先查看缺口，不让命令失败：
审计还会检查 `prepare:release-env` 仍然写入 `RELEASE_WRITE_MARKER` 并支持 `--write-marker`，确保发布、恢复演练、最终审计和证据采集默认使用同一批次标识。

```bash
npm run audit:phase1 -- --release-env-file .env --soft --json
```

若需要留下可审计发布证据，使用统一收集命令：

```bash
npm run evidence:phase1 -- --release-env-file .env --base-url https://fund.example.com
```

该命令会在 gitignored 的 `release-evidence/phase1-<write-marker>/` 下保存 preflight、前端构建、客户端密钥扫描、Compose 写入发布、恢复演练和最终 Phase 1 审计的日志与 `summary.json`。
`metadata.json` 会记录当前 branch、commit、Node/npm 版本、`workingTreeClean` 和 `gitStatusShort`；正式发布证据应来自干净工作区，避免后续无法复现同一版本。
`evidence:phase1` 会从同一个 `--release-env-file` 读取 `RELEASE_BASE_URL`、管理员账号和发布 marker；命令行参数只在需要覆盖 env 文件时使用，管理员密码不会写入 planned command 或 summary JSON。

## 服务组成

- `postgres`: PostgreSQL 16，保存服务端业务数据。
- `api`: Fastify 后端，生产镜像只包含 production dependencies、编译后的 `dist` 和 SQL migrations，提供认证、账本 API、AI 代理和数据库迁移命令。
- `web`: 构建后的 React 静态前端。
- `nginx`: 对外入口，配置由 `Dockerfile.nginx` 构建进镜像，转发 `/api/` 到后端，其余请求到前端。

## 一键 Compose 发布

目标服务器首选命令：

```bash
npm run deploy:compose -- --release-env-file .env --write
```

该命令会依次执行 `preflight:release`、`docker compose config --quiet`、`docker compose up -d --build`、API migration、seed、`/api/health` 等待和 `verify:release`。内部 preflight 与 verifier 都会显式复用同一个 `--release-env-file`，避免发布、登录和 marker 验收读取不同环境来源；Compose 配置校验使用 quiet 模式，避免发布日志输出解析后的环境变量。如果公网域名已经接入 HTTPS，传入正式入口：

```bash
npm run deploy:compose -- --release-env-file .env --base-url https://fund.example.com --write
```

本地用 `http://127.0.0.1:<port>` 验收时，`deploy:compose` 会把 `<port>` 作为 `HTTP_PORT` 传给 Compose，确保部署入口和 `verify:release` 验收入口一致。

如已单独通过 preflight，且只需要复用已有镜像：

```bash
npm run deploy:compose -- --release-env-file .env --skip-preflight --no-build --write
```

`deploy:compose` 可以重复执行。API migration 会先检查 `schema_migrations`；如果目标库已经有初始业务表但缺少迁移记录，会只补登记迁移，不会重放 `001_initial_schema.sql`。

## 备份恢复演练

Compose 发布写入验收通过后，在目标服务器执行恢复演练：

```bash
npm run drill:restore:compose -- --release-env-file .env --expect-write-marker "<write-marker>"
```

该命令默认读取 `.env`，也可用 `--release-env-file` 显式指定，会从当前 Compose PostgreSQL 导出备份，恢复到独立的 `fundapp_road_restore` 数据库，启动一个临时 API 容器连接恢复库，并对恢复库执行 `verify:release`。传入 `--expect-write-marker` 时，会读回同一发布 marker 下的任务、资料归档、AI 收件箱归档、会议确认、报告导出记录、资金确认记录、募集签署状态和关键审计事件。临时 API 默认使用 `8792` 端口，验证完成后会自动删除临时容器。
如果不传 `--expect-write-marker`，恢复演练会从同一个 `--release-env-file` 读取 `RELEASE_EXPECT_WRITE_MARKER` 或 `RELEASE_WRITE_MARKER`，默认复用 `prepare:release-env` 生成的发布批次标识。

## 必要环境变量

- `APP_AUTH_MODE`: 本地默认 `local-bypass`；服务器建议改为 `password`。
- `SESSION_SECRET`: 服务器必须改成至少 32 字符的强随机值；`password` 模式会拒绝默认值。
- `SESSION_COOKIE_SECURE`: HTTPS 对外访问时设置为 `true`，让浏览器只通过安全连接发送 session cookie；本地 HTTP 调试保持 `false`。
- `SESSION_MAX_AGE_SECONDS`: session 有效期，默认 `28800` 秒。
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: 密码模式管理员账号；服务器必须改成正式管理员邮箱和至少 12 字符的非默认密码。
- `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`: Compose PostgreSQL 配置；服务器必须设置非默认强 `POSTGRES_PASSWORD`。
- `DATABASE_URL`: API 容器内由 Compose 指向 `postgres` 服务；只有直连外部 PostgreSQL 时才需要手动设置。
- `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL`: Qwen AI 代理配置。

## 发布检查

```bash
docker compose ps
curl http://127.0.0.1/api/session/me
curl http://127.0.0.1/api/funds
curl http://127.0.0.1/api/ai/settings
npm run verify:release -- --release-env-file .env --base-url http://127.0.0.1
```

确认前端页面可打开基金详情页，新增任务后刷新页面仍可读到服务端记录，再开放外部访问。预发布或可回滚环境再执行写入验收：

```bash
npm run verify:release -- --release-env-file .env --base-url http://127.0.0.1 --write
```

写入验收会创建并读回发布验收任务、项目阶段更新、风险处理审计、资料归档、AI 收件箱归档、会议确认、报告草稿审核与导出、资金事项及管理费确认、募集签署确认。需要在 API 重启或恢复库上验证同一批写入时，复用写入时的 marker：

```bash
npm run verify:release -- --release-env-file .env --base-url http://127.0.0.1 --expect-write-marker "<write-marker>"
```

如果不传 `--expect-write-marker`，`verify:release` 会从同一个 `--release-env-file` 读取 `RELEASE_EXPECT_WRITE_MARKER` 或 `RELEASE_WRITE_MARKER`，默认复用 `prepare:release-env` 生成的发布批次标识。

`APP_AUTH_MODE=password` 时，`verify:release` 会优先从 `--release-env-file` 读取管理员账号。只在需要覆盖时手动传入：

```bash
npm run verify:release -- --release-env-file .env --base-url http://127.0.0.1 --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --write
```

如果 `APP_AUTH_MODE=password` 但仍使用 `change-me`、`admin@example.local` 或过短密钥/密码，API 会拒绝启动。

## 数据库备份与恢复

发布前执行一次备份：

```bash
npm run backup:db -- --release-env-file .env --file backups/pre-release.dump
```

如果 `.env` 或当前 shell 设置了 `DATABASE_URL`，脚本会直接调用 `pg_dump`。如果未设置 `DATABASE_URL`，脚本会通过 `docker compose exec -T postgres pg_dump` 从 Compose 的 `postgres` 服务导出。

恢复到目标数据库：

```bash
npm run restore:db -- --release-env-file .env --file backups/pre-release.dump
```

恢复后必须检查：

```bash
curl http://127.0.0.1/api/funds
curl http://127.0.0.1/api/tasks
curl http://127.0.0.1/api/audit-events
```

生产环境不要提交 `backups/*.dump`；仓库只保留 `backups/.gitkeep` 作为目录占位。
