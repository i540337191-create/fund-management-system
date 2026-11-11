# Linux 服务端交付

此文替代早期 phase1 演示部署流程。正式环境不自动灌入演示业务数据，不使用 local-bypass。当前支持单个 API 实例；会话/摘要/确认卡存于 PostgreSQL，原件和派生识别缓存存于持久卷。不要在没有共享生成租约前扩大 API 副本数。

## 构建与依赖

宿主机需要Docker Compose v2；发布、指纹预检和备份脚本使用宿主Node.js 22。OCR/Office/Python及Harness依赖全部位于API镜像中，不依赖Mac或宿主Office安装。

Docker API 镜像采用 Debian/Node22，包含中英 Tesseract、Poppler、LibreOffice Writer/Calc/Impress、Python/Pillow/openpyxl、FFmpeg、本地Whisper转写运行时、CJK 字体，以及固定版本的官方 Harness 和本项目白名单业务桥。构建需要下载系统和 npm 依赖，运行 OCR 不需要外部 OCR 服务，也不会把原件上传到 OCR 厂商。

PDF逐页识别并记录来源页；PNG/JPEG识别中文和英文；DOC/DOCX抽取正文；TXT/MD/CSV直接读取。复杂表格、手写和图片中的金额需要人工复核，不保证字段准确率。XLS/XLSX按工作表读取单元格、日期、百分比及公式缓存；PPT/PPTX按幻灯片读取正文、表格文字和备注。Office中嵌入图片/图表的识别不等同于正文抽取，仍需核对原件。扫描PDF最多200页，原件25MiB，文档单次解析超时260秒；失败显示失败且保留原件，可显式重试。识别缓存按版本和SHA256隔离，旧版本正文不作为新版本检索证据。

容器启动先检查依赖、认证和数据库并运行幂等迁移，检查失败不监听端口；不会运行seed。Compose的原件卷路径为 `/app/private-material-storage/data`，会随容器重建保留。旧卷根布局会在API启动前以原子移动迁入data，迁移日志支持中断后续接；混合且冲突的布局会停止启动，保留文件供核对。卷的读取权限迁移完成后以node用户运行API，避免旧root写入的原件变为不可读。完整备份覆盖整个卷，包含旧布局和识别缓存。现有Mac本地预览使用其原目录，不受此布局变更影响。

## 录音转写与中断恢复

支持WAV/MP3/M4A/OGG/WebM/FLAC，每份最长60分钟，原件上限仍为25MiB。服务器验证媒体后经FFmpeg标准化，使用本地CPU多语言Whisper模型转写，录音不会发送给外部ASR服务。源码和量化模型随server/vendor/asr交付，构建和启动校验固定SHA256，启动时还会用临时静音样本实际加载模型并执行CPU后端，提前发现二进制/CPU不兼容；运行时不需要下载模型或配置ASR密钥。

录音上传后立即返回pending，不代表转写完成。资料“版本 / 关联”自动刷新解析进度；只有完成正文可进入检索与AI引用，录音段落带时间区间。静音、损坏、超时或超过时长限制会失败并保留原件，可重试。所选录音尚未完成时，数字员工明确回复解析中，不编造内容或引用。

同一API进程最多同时处理一份录音和一份其他文档，避免重启恢复并发放大。启动恢复当前版本缺失/pending的解析，并清理旧scratch副本；原件与结果不删除。这要求单API拥有持久卷，不支持多实例共享租约。ASR_WHISPER_BIN/ASR_MODEL_PATH可指定受控路径，正式镜像已有固定默认值。

转写准确度与耗时受录音噪声、口音及CPU影响，真实人名、金额和日期须核对原音。客户机器容量、长录音与并发性能仍需在目标环境验收。

## 来源包与配置

没有Git的工作区使用 `npm run package:release:workspace`。产物有归档SHA256与逐文件 `release-manifest.json`；排除本地密钥、node_modules、运行数据和备份。解包后预检会核对逐文件哈希，改动源文件会阻止交付。不要将任何 `.env`、数据库dump或上传原件放入源码包。

在源码目录外生成私有配置：

```sh
npm run prepare:release-env -- --output /absolute/private/fundapp.env --admin-email ops@example.com --base-url https://fund.example.com
```

保留生成的会话密钥/管理员密码，并通过服务端配置填写获准使用的QWEN_API_KEY/BASE_URL/MODEL。不要把密钥写入浏览器VITE变量或聊天。API支持离散PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE，密码中的URI特殊字符会编码；Compose自动连接内部postgres，数据库不发布主机端口。

生产建议由宝塔/现有网关提供域名和TLS，再反代127.0.0.1的HTTP_PORT。Compose默认只绑定127.0.0.1，不自动开放公网；需要直接监听其他网卡时须主动设置HTTP_BIND_ADDRESS并配置防火墙/TLS。实际外网HTTPS时SESSION_COOKIE_SECURE应为true。域名、证书和目标机器的网络配置需要在目标环境验收，容器测试不能替代它。

```sh
npm run preflight:release -- --compose --release-env-file /absolute/private/fundapp.env
npm run deploy:compose -- --release-env-file /absolute/private/fundapp.env
```

首次为空业务库是正常状态。由管理员建员工、基金、项目并配置协作成员；不要为了让健康验证通过导入演示基金。历史数据迁移/真实文件导入应单独核对来源和对象范围。`verify:release`默认只读；旧 `--write` 是针对明确标记的演示验收环境，不应对客户真实项目运行。

Nginx对API关闭缓冲/缓存，读写超时300秒，以支持流式AI和解析。四个服务均配置重启策略；API健康后网关才启动。主机仍需配置磁盘空间、容器日志轮转、备份保留与离机备份。

## 一致备份和恢复

`backup:db`只导出数据库，不是完整系统备份。正式使用完整备份：

```sh
npm run backup:full -- --write --release-env-file /absolute/private/fundapp.env --directory /absolute/backups/backup-YYYYMMDD
```

会短暂停止API；在途AI生成会中断并保留已接收内容，应安排维护窗口。保存数据库、整个原件/派生缓存卷以及私有配置，完成写入并校验后才宣布成功，然后恢复原API状态。目标目录须不存在；备份含个人/业务信息及凭据，目录0700、文件0600，必须加密/受控离机保存，禁止发布到网页目录。

完整恢复限定**新建空目标**，避免覆盖客户已有业务；准备新的Compose项目名、相同应用认证配置和独立端口/持久卷，先只启动postgres：

```sh
COMPOSE_PROJECT_NAME=fundapp-restore docker compose --env-file /absolute/private/restore.env up -d postgres
COMPOSE_PROJECT_NAME=fundapp-restore npm run restore:full -- --write --fresh-target --release-env-file /absolute/private/restore.env --directory /absolute/backups/backup-YYYYMMDD
```

恢复前核对全部归档哈希；数据库使用单事务、错误即退出；私有文件拒绝路径穿越/符号链接及覆盖既有文件。恢复成功后才启动API。失败时保留目标API停止，使用另一全新目标重做；不得让部分恢复的目标对外提供服务。原目标和备份都保留。恢复后重新检查登录、业务数量、对话摘要、原件哈希、OCR搜索与AI引用，再切换正式域名。备份是时间点快照，应核对备份之后的离职/权限变更，正式切换前建议轮换SESSION_SECRET使旧登录失效；对话原文和摘要不受该密钥轮换影响。

原有单库恢复命令已加单事务/错误退出，但仍只恢复数据库；不承担完整系统原件恢复。备份和演练时应禁止其他外部客户端绕过API直接写同一业务库。

## 交付边界

Linux解析、正式镜像、上传/检索/引用、文档导出和全量恢复的本轮实际结果见随包验收记录；不要用源码存在替代运行结果。未接入的企微/邮件/银行/监管真实外部通道、多租户及多API生成租约不因本轮部署适配自动成为已完成能力。真实客户材料质量与业务结论仍需联合验收。
