import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_QWEN_AI_SETTINGS,
  buildQwenChatPayload,
  createAiServiceStatus,
  createRuleBasedAiReply,
  fetchAiServiceStatus,
} from "../src/lib/aiService.ts";

test("defaults every project AI service call to Qwen compatible-mode settings", () => {
  assert.equal(DEFAULT_QWEN_AI_SETTINGS.providerName, "Qwen 多模态服务");
  assert.equal(DEFAULT_QWEN_AI_SETTINGS.baseUrl, "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
  assert.equal(DEFAULT_QWEN_AI_SETTINGS.model, "qwen3.7-max");
  assert.equal(DEFAULT_QWEN_AI_SETTINGS.chatEndpoint, "/api/ai/chat");
});

test("builds an OpenAI-compatible Qwen payload with project guardrails", () => {
  const payload = buildQwenChatPayload({
    prompt: "生成示例成长一期基金季度运营报告",
    attachmentName: "季度运营数据.xlsx",
  });

  assert.equal(payload.model, "qwen3.7-max");
  assert.equal(payload.messages[0].role, "system");
  assert.match(payload.messages[0].content, /人工确认/);
  assert.match(payload.messages[0].content, /来源/);
  assert.match(payload.messages.at(-1)?.content ?? "", /季度运营数据.xlsx/);
  assert.match(payload.messages.at(-1)?.content ?? "", /生成示例成长一期基金季度运营报告/);
});

test("reports server-side API key status without exposing the key value", () => {
  const status = createAiServiceStatus({
    apiKey: "sk-test-secret-value",
    baseUrl: " https://example.invalid/v1 ",
    model: " qwen-test ",
  });

  assert.equal(status.apiKeyConfigured, true);
  assert.equal(status.maskedApiKey.includes("sk-test-secret-value"), false);
  assert.equal(status.baseUrl, "https://example.invalid/v1");
  assert.equal(status.model, "qwen-test");
});

test("fallback leads to manual entry without inventing a confirmed business record", () => {
  const reply = createRuleBasedAiReply("帮我记录演示智能设备今天到账 3000 万");

  assert.equal(reply.action?.href, "/capital");
  assert.equal(JSON.stringify(reply).includes("3000"),false);
  assert.equal(JSON.stringify(reply).includes("演示智能设备"),false);
  assert.deepEqual(reply.sources, ["办理指引（未读取业务记录）"]);
  assert.match(reply.content, /资金事项/);
});

test("keeps masked server-side key status when fetching AI settings", async () => {
  const status = await fetchAiServiceStatus(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      providerName: "Qwen 多模态服务",
      baseUrl: "https://example.invalid/v1",
      model: "qwen-test",
      chatEndpoint: "/api/ai/chat",
      settingsEndpoint: "/api/ai/settings",
      apiKeyConfigured: true,
      maskedApiKey: "sk-tes...1234",
      mode: "server-side",
      capabilities: ["项目问答"],
    }),
    text: async () => "",
  }));

  assert.equal(status.apiKeyConfigured, true);
  assert.equal(status.maskedApiKey, "sk-tes...1234");
  assert.deepEqual(status.capabilities, ["项目问答"]);
});
