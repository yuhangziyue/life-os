// ========== AI 服务：OpenAI 兼容 API 调用 + 降级策略 ==========

// ---- AI 配置类型 ----

export interface AIConfig {
  endpoint: string
  apiKey: string
  model: string
  isEnabled: boolean
}

export interface AITestResult {
  success: boolean
  message: string
  latencyMs: number
}

export interface AIGoalResult {
  title: string
  description: string
  quantitativeTarget: number | null
  quantitativeUnit: string | null
  source: 'ai' | 'fallback'
}

export interface AIScoreSuggestion {
  suggestedScore: number
  reason: string
  suggestion: string
}

// ---- 默认配置 ----

const DEFAULT_CONFIG: AIConfig = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  isEnabled: false,
}

const STORAGE_KEY = 'life-os-ai-config'

// ---- 配置管理 ----

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed, apiKey: parsed.apiKey || '' }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

// ---- 连接测试 ----

export async function testConnection(config: AIConfig): Promise<AITestResult> {
  if (!config.apiKey) {
    return { success: false, message: '未配置 API Key', latencyMs: 0 }
  }

  const startTime = Date.now()

  try {
    const response = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '回复 "pong"' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const latencyMs = Date.now() - startTime

    if (response.ok) {
      return { success: true, message: '连接成功', latencyMs }
    }

    const message = parseError(response.status)
    return { success: false, message, latencyMs }
  } catch (e) {
    const latencyMs = Date.now() - startTime
    return { success: false, message: `连接失败: ${(e as Error).message}`, latencyMs }
  }
}

function parseError(status: number): string {
  switch (status) {
    case 401: return 'API Key 无效或已过期'
    case 403: return '无权访问该模型，请检查 API Key 权限'
    case 429: return '请求过于频繁，请稍后重试'
    case 500: case 502: case 503: return '服务器错误，请稍后重试'
    default: return `HTTP ${status}`
  }
}

// ---- AI 辅助生成目标 ----

export async function generateGoal(
  config: AIConfig,
  dimensionName: string,
  userInput: string,
): Promise<AIGoalResult> {
  if (!config.isEnabled || !config.apiKey) {
    return fallbackGoal(dimensionName, userInput)
  }

  const prompt = `你是一位专业的生命教练（Life Coach），帮助用户优化他们在「${dimensionName}」维度的目标。

用户当前的想法：
「${userInput}」

请生成一个优化后的目标，包含：
1. 一个精炼的目标标题（10字以内）
2. 一个详细的定性描述（50-100字，说明为什么这个目标重要、如何衡量成功）
3. 一个可选的定量指标（建议一个数值目标和单位，如"每周3次"、"3个月内完成"等）

请以 JSON 格式返回：
{ "title": "目标标题", "description": "详细描述", "quantitative": { "target": 数值, "unit": "单位" } }`

  try {
    const content = await callAI(config, [
      { role: 'system', content: '你是一位专业的生命教练，回复必须是有效的 JSON 格式。' },
      { role: 'user', content: prompt },
    ], 500)

    if (!content) return fallbackGoal(dimensionName, userInput)

    const json = extractJSON(content)
    if (!json) return fallbackGoal(dimensionName, userInput)

    const parsed = JSON.parse(json)
    return {
      title: parsed.title || userInput.slice(0, 10),
      description: parsed.description || `在「${dimensionName}」维度：${userInput}`,
      quantitativeTarget: parsed.quantitative?.target ?? null,
      quantitativeUnit: parsed.quantitative?.unit ?? null,
      source: 'ai',
    }
  } catch {
    return fallbackGoal(dimensionName, userInput)
  }
}

// ---- AI 评分建议 ----

export async function suggestScore(
  config: AIConfig,
  dimensionName: string,
  currentScore: number,
  recentActions: string[],
  goals: string[],
): Promise<AIScoreSuggestion | null> {
  if (!config.isEnabled || !config.apiKey) return null

  const prompt = `作为生命教练，请根据以下信息评估「${dimensionName}」维度的评分：

当前评分：${currentScore.toFixed(1)}/10
最近行动：${recentActions.join('；') || '无'}
目标：${goals.join('；') || '无'}

请提供：
1. 建议评分（0-10 数字）
2. 理由（50字以内）
3. 改进建议（一句话，50字以内）

JSON 格式：{ "suggestedScore": 数字, "reason": "理由", "suggestion": "改进建议" }`

  try {
    const content = await callAI(config, [
      { role: 'system', content: '你是一位专业的生命教练，回复必须是有效的 JSON 格式。' },
      { role: 'user', content: prompt },
    ], 300)

    if (!content) return null
    const json = extractJSON(content)
    if (!json) return null

    const parsed = JSON.parse(json)
    return {
      suggestedScore: parsed.suggestedScore ?? currentScore,
      reason: parsed.reason ?? '',
      suggestion: parsed.suggestion ?? '',
    }
  } catch {
    return null
  }
}

// ---- 内部工具 ----

async function callAI(
  config: AIConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<string | null> {
  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) return null

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? null
}

function extractJSON(text: string): string | null {
  // 尝试提取 ```json ... ``` 代码块
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  // 尝试直接找 JSON 对象
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : null
}

function fallbackGoal(dimensionName: string, userInput: string): AIGoalResult {
  return {
    title: userInput.slice(0, 10),
    description: `在「${dimensionName}」维度：${userInput}`,
    quantitativeTarget: null,
    quantitativeUnit: null,
    source: 'fallback',
  }
}
