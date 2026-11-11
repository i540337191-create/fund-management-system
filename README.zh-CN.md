# 基金管理系统

[English](README.md) · [中文](README.zh-CN.md)

一个仍在开发中的开源基金业务工作台，覆盖基金、项目、待办、审批、资料、风险、资金费用和工作周报。保留金色冰山工作台，英文默认，支持中文切换。

## 本地演示

需要 Node.js 22.18+、npm 和 Git。基础演示不需要数据库或 AI 密钥。

```sh
git clone https://github.com/i540337191-create/fund-management-system.git
cd fund-management-system
npm ci
npm --prefix server ci
npm run demo
```

打开 http://127.0.0.1:15248/dashboard。右上角切换 EN / 中文。

内置4只虚构基金、6个虚构项目、8位虚构投资人和10条基础待办，并生成演示资料、风险、资金事项和周报。业务派生的事项可能使工作台总待办数高于基础待办数。日期按启动当天生成，便于展示逾期、今日和近期安排。

所有名称、金额、文件和活动均为虚构。本仓库不含客户数据库、原件、密钥或私有配置。演示使用隔离内存，重启API后重置，不连接当前电脑的开发数据库。上传的演示文件保存在被Git忽略的`.demo-files/`目录。仅监听本机地址；不要把本地演示模式直接暴露到公网。

## 功能与开发

包含基金全周期、项目流程、LP资料、待办审批通知、资料上传版本与预览、风险关注、资金费用、会议和周报。AI功能需要自行配置兼容的服务和密钥；没有密钥时不编造AI结果。

```sh
npm test
npm run test:api
npm run build
npm run build:api
```

原依赖私有资料的回归测试已改用独立的虚构小样本。示例清单模板重新生成，不是客户原件或通用法律标准。金融与适当性规则正式使用前应按组织及司法辖区配置并由专业人员复核。

持久化部署使用 PostgreSQL 16、迁移与独立文件存储；配置见`.env.example`及`docs/deployment/`。正式部署前设置密码认证、独立强密钥与HTTPS。文档生成使用Python标准库；PDF转换需要LibreOffice。Ubuntu CI安装对应Office/OCR依赖，并明确配置`DOCUMENT_PYTHON`与`DOCUMENT_SOFFICE`。完整容器/语音识别构建需先执行`git lfs install && git lfs pull`。

本项目代码采用MIT许可证；依赖及语音识别模型保留原许可证。当前为开发版本，不代表金融合规认证、正式客户案例或自动投资决策服务。

主界面支持中英切换；少量服务端动态提示及导出模板仍保留中文。

CI的AI收件箱持久化检查使用`tests/fixtures/ci-ai-provider.mjs`，只接受已知合成原文、原样引用并明确标注测试输出，不执行模型推理；本地浏览器演示不接入该fixture。
