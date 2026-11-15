
const ROUTE = '/api/prompt-craft'
const MAX_INPUT_CHARS = 20000
const CALL_TIMEOUT_MS = 60000
const MAX_REPAIRABLE_MISSING = 3

const MODES = {
  standard: {
    label: '标准',
    maxTokens: 1600,
    spec: '使用 Markdown，最多四个小标题：`# 任务`、`## 具体要求`、`## 约束`、`## 输出要求`（没有内容的标题直接省略）。'
      + '「具体要求」用有序列表，一条一个动作；「约束」「输出要求」用 `- ` 列表。'
      + '总长度不超过原文的 1.5 倍，读起来像一份干脆、可以直接执行的任务说明。',
  },
  concise: {
    label: '精简',
    maxTokens: 900,
    spec: '使用 Markdown，总长度不超过 6 行：`# 任务` 一句话说明要做什么，然后 `## 要点` 用 `- ` 列出最多 5 条要点，'
      + '把原文里的每个要求压进这 5 条里。这是「压缩表达」，不是「删减信息」：一条要求都不许丢。',
  },
  detailed: {
    label: '详细',
    maxTokens: 2400,
    spec: '使用 Markdown，依次使用 `# 任务`、`## 背景与具体信息`、`## 具体要求`（编号）、`## 约束`、`## 输出要求`、`## 自检清单`。'
      + '每条要求都写清「做什么、做到什么程度、怎样算完成」；自检清单用 `- [ ] ` 复选框，逐条覆盖原文里的每个约束。'
      + '不要编造原文没有的规则；需要追问的地方写进「## 待确认」。',
  },
  structured: {
    label: '结构化',
    maxTokens: 2000,
    spec: '严格使用固定骨架，缺哪节就整节省略：`## 目标`、`## 输入与上下文`、`## 步骤`、`## 约束与红线`、`## 输出格式`、`## 验收标准`。'
      + '全部用列表，每句尽量短，便于机器阅读；不要写成大白话段落。',
  },
}

const FIDELITY_RULES = [
  '你是一名中文「提示词工程师」。用户会给你一段凌乱、冗长、口语化、思维跳跃的原始文字，你把它改写成一份通俗易懂、排版工整、可以直接交给 AI 执行的中文提示词。',
  '',
  '【最高优先级：绝不改变原意】',
  '1. 原文中的每一个事实、数字、单位、时间、名称、文件名、路径、代码片段、ID、专有名词，以及否定条件（不要 / 不能 / 禁止 / 别），都必须保留；不得新增原文没有的事实、假设或要求。',
  '2. 你只允许做三件事：调整语序、删掉纯口头填充词（例如「那个」「就是说」「呃」「然后呢」）、把同一件事合并成更通顺的一两句话。',
  '3. 原文里所有「要求 / 约束 / 输出格式」都不能被合并掉；可以合并同类项，但合并后每一条仍然各占一行。',
  '4. 拿不准的地方宁可原样保留，也不要替用户下结论；原文自相矛盾时，把两种说法都写进「待确认」，不要自己选一个。',
  '5. 不要解释你在做什么，不要开场白、不要结尾寒暄、不要用代码块把整份提示词包起来。直接输出提示词正文。',
].join('\n')

export const inject = ['connection', 'llm']

export function apply(ctx, config) {
  const craft = new PromptCraft(ctx, config)
  // Wrapped in an effect so the route is torn down with this plugin's own fiber
  // when the row is unloaded, instead of outliving it until the next start.
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => craft.respond(request),
    }),
    'prompt-craft: fetch route',
  )
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function ok(value) {
  return { ok: true, value }
}

function fail(code, message) {
  return { ok: false, error: { code, message } }
}

function reason(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

class PromptCraft {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config !== null && typeof config === 'object' ? config : {}
  }

  async respond(request) {
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse(fail('prompt-craft/bad-request', 'the request body is not JSON'), 400)
    }
    if (body === null || typeof body !== 'object') {
      return jsonResponse(fail('prompt-craft/bad-request', 'the request body must be a JSON object'), 400)
    }
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    return jsonResponse(await this.handle(endpoint, body.payload))
  }

  async handle(endpoint, payload) {
    const request = payload !== null && typeof payload === 'object' ? payload : {}
    if (endpoint === 'describe') {
      return ok({
        modes: Object.entries(MODES).map(([id, meta]) => ({ id, label: meta.label })),
        route: this.route(),
        engine: this.engineAvailability(),
      })
    }
    const text = typeof request.text === 'string' ? normalizeSource(request.text) : ''
    if (text === '') return fail('prompt-craft/empty-input', '原始文字是空的：先把要改写的文字放进输入框，或直接粘进面板。')
    if (text.length > MAX_INPUT_CHARS) {
      return fail('prompt-craft/too-long', `原文 ${text.length} 字，超过 ${MAX_INPUT_CHARS} 字上限；请分段改写。`)
    }
    const modeId = typeof request.mode === 'string' && MODES[request.mode] !== undefined ? request.mode : 'standard'
    const engineChoice = request.engine === 'local' ? 'local' : 'auto'
    if (endpoint === 'local' || engineChoice === 'local') {
      return ok(this.localResult(text, modeId))
    }
    if (endpoint !== 'polish') {
      return fail('prompt-craft/unknown-endpoint', `未知 endpoint: ${JSON.stringify(endpoint)}`)
    }
    const outcome = await this.polish(text, modeId)
    return ok(outcome)
  }

  engineAvailability() {
    const route = this.route()
    if (route === null) return { llm: false, local: true, why: '没有可用的模型路由，只能用本地保真模式' }
    return { llm: true, local: true, why: '' }
  }

  route() {
    const pinned = this.config
    if (typeof pinned.provider === 'string' && pinned.provider !== ''
      && typeof pinned.model === 'string' && pinned.model !== '') {
      return { provider: pinned.provider, model: pinned.model }
    }
    try {
      const store = this.ctx.get('agentDefaultModel')
      const selection = typeof store?.currentSelection === 'function' ? store.currentSelection() : undefined
      if (typeof selection?.provider === 'string' && selection.provider !== ''
        && typeof selection?.model === 'string' && selection.model !== '') {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      // A profile without the default-model service still has the local engine.
    }
    return { provider: 'deepseek-official', model: 'deepseek-flash' }
  }

  localResult(text, modeId) {
    const prompt = localPrompt(text, modeId)
    return {
      prompt,
      mode: modeId,
      engine: 'local',
      model: null,
      fidelity: { checked: hardTokens(text).length, missing: [], patched: false },
      note: '本地保真模式：只调整顺序、补标题，一个字的原意都不改。',
    }
  }

  async polish(text, modeId) {
    const meta = MODES[modeId]
    const local = localPrompt(text, modeId)
    let attempt
    let failure
    try {
      attempt = await this.askLlm(text, modeId, [])
    } catch (error) {
      failure = error
    }
    if (attempt === undefined) {
      return {
        ...this.localResult(text, modeId),
        note: `模型改写没成功（${reason(failure)}），已自动改用本地保真模式：内容一字未改，只是重新排版。`,
      }
    }
    let check = fidelityCheck(text, attempt)
    if (check.missing.length > 0) {
      try {
        const retry = await this.askLlm(text, modeId, check.missing)
        const retryCheck = fidelityCheck(text, retry)
        if (retryCheck.missing.length < check.missing.length) {
          attempt = retry
          check = retryCheck
        }
      } catch {
        // Keep the first answer and repair it below; a retry is best-effort.
      }
    }
    const route = this.route()
    if (check.missing.length === 0) {
      return {
        prompt: attempt,
        mode: modeId,
        engine: 'llm',
        model: route === null ? null : `${route.provider}/${route.model}`,
        fidelity: { checked: check.checked, missing: [], patched: false },
        note: `已由模型改写，并逐条核对：原文里的 ${check.checked} 处硬信息（数字 / 英文 / 引号内容）全部保留。`,
      }
    }
    if (check.missing.length <= MAX_REPAIRABLE_MISSING) {
      return {
        prompt: appendMissing(attempt, check.missing),
        mode: modeId,
        engine: 'llm',
        model: route === null ? null : `${route.provider}/${route.model}`,
        fidelity: { checked: check.checked, missing: [...check.missing], patched: true },
        note: `模型改写漏了 ${check.missing.length} 处细节，已把原文原话补在末尾「原文细节（照抄）」一节，其余按${meta.label}模式排版。`,
      }
    }
    return {
      ...this.localResult(text, modeId),
      prompt: local,
      note: `模型改写漏掉 ${check.missing.length} 处原文细节（${check.missing.slice(0, 3).map((item) => `「${item}」`).join('、')}…），为避免改错意思，已自动改用本地保真模式。`,
    }
  }

  async askLlm(text, modeId, missing) {
    const meta = MODES[modeId]
    const route = this.route()
    if (route === null) throw new Error('没有可用的模型路由')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    const system = [FIDELITY_RULES, '', `【本次排版模式：${meta.label}】`, meta.spec].join('\n')
    const reminder = missing.length === 0
      ? ''
      : `\n\n注意：上一版漏掉了下面这些原文细节，这一版必须逐字保留它们——${missing.map((item) => `「${item}」`).join('、')}`
    const messages = [{
      id: globalThis.crypto.randomUUID(),
      role: 'user',
      content: [{
        type: 'text',
        text: `【用户原始文字（以下是用户亲口说的全部内容，不得增删事实）】\n"""\n${text}\n"""\n\n请按「${meta.label}」模式改写，只输出改写后的提示词正文。${reminder}`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-plugin-prompt-craft' },
    }]
    try {
      let collected = ''
      let finish
      const stream = this.ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        system,
        messages,
        maxTokens: outputBudget(text, meta.maxTokens),
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') collected += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish !== undefined && (finish.kind === 'error' || finish.kind === 'aborted')) {
        throw new Error(finish.failure?.message ?? `模型调用以 ${finish.kind} 结束`)
      }
      const cleaned = stripOuterFence(collected).trim()
      if (cleaned === '') throw new Error('模型没有返回任何内容')
      return cleaned
    } finally {
      clearTimeout(timer)
    }
  }
}

function normalizeSource(raw) {
  return String(raw)
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function outputBudget(text, base) {
  const scaled = base + Math.max(0, Math.round(text.length * 0.9))
  return Math.min(6000, Math.max(base, scaled))
}

function stripOuterFence(text) {
  const trimmed = text.trim()
  const match = /^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/u.exec(trimmed)
  if (match === null) return trimmed
  const inner = match[1]
  // Only unwrap when the fence is the whole answer; inner fences stay put.
  return inner.includes('```') ? trimmed : inner
}

// Local engine: reorder and add headings, never reword.

const SENTENCE_SPLIT = /(?<=[。！？!?；;])/u
const LEADING_FILLER = /^(?:嗯+|呃+|额+|啊+|那个|这个|就是|然后|所以说|其实|反正|就是说|那什么)[，,、]\s*/u
const GOAL_RE = /^(?:帮我|请|请你|麻烦|我要|我想|我需要|我们希望|希望你|能不能|可以帮我|给我|我想要|我想要你|咱|我们)/u
const CONSTRAINT_RE = /(不要|不能|别|禁止|务必|必须|一定|只能|仅限|至少|最多|不超过|保证|记得|注意|小心|严格|不许)/u
const OUTPUT_RE = /(输出成|输出为|输出到|输出格式|格式为|格式是|用\s?markdown|markdown\s?表格|表格|返回给我|给我(?:一个|一份|一段)|整理成|列成|写成|生成一份|json|jsonl|csv|字数|标题|大纲|摘要|分段|排版|字体|文件名)/iu

function stripFiller(item) {
  let out = item
  for (let index = 0; index < 3; index += 1) {
    const next = out.replace(LEADING_FILLER, '')
    if (next === out) break
    out = next
  }
  return out.trim()
}

function splitOriginal(text) {
  const items = []
  for (const rawLine of text.split(/\n+/u)) {
    const line = stripFiller(rawLine.trim())
    if (line === '') continue
    for (const piece of line.split(SENTENCE_SPLIT)) {
      const clean = stripFiller(piece.trim())
      if (clean === '') continue
      for (const clause of splitClauses(clean)) items.push(clause)
    }
  }
  return items
}

function splitClauses(sentence) {
  if (sentence.length <= 40) return [sentence]
  const clauses = []
  for (const part of sentence.split(/(?<=[，,、])/u)) {
    const clause = stripFiller(part.trim().replace(/[，,、。；;]+$/u, '').trim())
    if (clause !== '') clauses.push(clause)
  }
  return clauses.length === 0 ? [sentence] : clauses
}

function bucketItems(items) {
  const goal = []
  const constraints = []
  const output = []
  const detail = []
  for (const item of items) {
    if (GOAL_RE.test(item)) goal.push(item)
    else if (CONSTRAINT_RE.test(item)) constraints.push(item)
    else if (OUTPUT_RE.test(item)) output.push(item)
    else detail.push(item)
  }
  // Every prompt needs one task line. With no sentence that reads like a goal,
  // the first sentence is promoted — moved, not copied, so nothing repeats.
  if (goal.length === 0 && items.length > 0) {
    const first = items[0]
    goal.push(first)
    for (const bucket of [constraints, output, detail]) {
      const at = bucket.indexOf(first)
      if (at !== -1) bucket.splice(at, 1)
    }
  }
  return { goal, constraints, output, detail }
}

function numbered(items) {
  return items.map((item, index) => `${String(index + 1)}. ${item}`).join('\n')
}

function bullets(items) {
  return items.map((item) => `- ${item}`).join('\n')
}

function sections(parts) {
  return parts.filter((part) => part !== '').join('\n\n')
}

function localPrompt(text, modeId) {
  const items = splitOriginal(text)
  if (items.length === 0) return ''
  const { goal, constraints, output, detail } = bucketItems(items)
  const goalLine = goal.join(' ')
  if (modeId === 'concise') {
    return sections([
      `# 任务\n${goalLine}`,
      constraints.length + output.length + detail.length === 0
        ? ''
        : `## 要点\n${bullets([...detail, ...constraints, ...output])}`,
    ])
  }
  if (modeId === 'detailed') {
    return sections([
      `# 任务\n${goalLine}`,
      detail.length === 0 ? '' : `## 背景与具体信息\n${bullets(detail)}`,
      constraints.length === 0 ? '' : `## 约束（不可违背）\n${bullets(constraints)}`,
      output.length === 0 ? '' : `## 输出要求\n${bullets(output)}`,
      '## 执行步骤\n1. 先用一句话复述你对任务的理解，确认没有偏差。\n2. 按上面的要求逐条执行；缺少信息时先问，不要自己假设。\n3. 完成后按「输出要求」交付，并逐条对照约束自检。',
      constraints.length === 0 ? '' : `## 自检清单\n${constraints.map((item) => `- [ ] ${item}`).join('\n')}`,
    ])
  }
  if (modeId === 'structured') {
    return sections([
      `## 目标\n${goalLine}`,
      detail.length === 0 ? '' : `## 输入与上下文\n${bullets(detail)}`,
      output.length === 0 ? '' : `## 输出格式\n${bullets(output)}`,
      constraints.length === 0 ? '' : `## 约束与红线\n${bullets(constraints)}`,
      constraints.length === 0
        ? '## 验收标准\n- 输出符合上面的目标与输出格式。'
        : `## 验收标准\n${constraints.map((item) => `- [ ] ${item}`).join('\n')}`,
    ])
  }
  return sections([
    `# 任务\n${goalLine}`,
    detail.length === 0 ? '' : `## 具体要求\n${numbered(detail)}`,
    constraints.length === 0 ? '' : `## 约束\n${bullets(constraints)}`,
    output.length === 0 ? '' : `## 输出要求\n${bullets(output)}`,
  ])
}

// Fidelity guard

const NUMBER_RE = /[0-9]+(?:[.,][0-9]+)*\s*(?:[%‰])?/gu
const LATIN_RE = /[A-Za-z][A-Za-z0-9_.:\-/\\]{2,}/gu
const QUOTE_RE = /[「『“"]([^」』”"\n]{1,60})[」』”"]/gu
const LATIN_STOP = new Set([
  'the', 'and', 'for', 'you', 'this', 'that', 'with', 'are', 'not', 'can', 'but', 'all', 'any',
  'use', 'from', 'will', 'have', 'has', 'its', 'our', 'your', 'was', 'were', 'they', 'them',
])
const FULLWIDTH = new Map([
  ['０', '0'], ['１', '1'], ['２', '2'], ['３', '3'], ['４', '4'], ['５', '5'], ['６', '6'], ['７', '7'], ['８', '8'], ['９', '9'],
  ['．', '.'], ['，', ','], ['％', '%'], ['：', ':'], ['／', '/'],
])

function normalizeForMatch(value) {
  let out = ''
  for (const char of String(value).toLowerCase()) {
    if (/\s/u.test(char)) continue
    out += FULLWIDTH.get(char) ?? char
  }
  return out
}

function chineseNumeral(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9999) return null
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (value < 10) return digits[value]
  if (value < 20) return value === 10 ? '十' : `十${digits[value % 10]}`
  if (value < 100) {
    const tens = Math.floor(value / 10)
    const rest = value % 10
    return rest === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[rest]}`
  }
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const head = `${digits[hundreds]}百`
  if (rest === 0) return head
  if (rest < 10) return `${head}零${digits[rest]}`
  return `${head}${chineseNumeral(rest)}`
}

function variantsOf(token) {
  const variants = new Set([normalizeForMatch(token)])
  const numeric = /^([0-9]+)(?:\.[0-9]+)?\s*(%|‰)?$/u.exec(token.trim())
  if (numeric !== null) {
    const whole = Number(numeric[1])
    const numeral = chineseNumeral(whole)
    if (numeral !== null) {
      variants.add(normalizeForMatch(numeric[2] === undefined ? numeral : `${numeral}${numeric[2]}`))
      if (numeric[2] !== undefined) variants.add(normalizeForMatch(`百分之${numeral}`))
      if (numeric[2] === '‰') variants.add(normalizeForMatch(`千分之${numeral}`))
    }
  }
  return [...variants]
}

function hardTokens(text) {
  const found = new Map()
  const add = (raw) => {
    const value = raw.trim()
    if (value === '') return
    const key = normalizeForMatch(value)
    if (found.has(key)) return
    found.set(key, value)
  }
  for (const match of text.matchAll(NUMBER_RE)) {
    if (/[0-9]/u.test(match[0])) add(match[0])
  }
  for (const match of text.matchAll(LATIN_RE)) {
    const value = match[0]
    if (LATIN_STOP.has(value.toLowerCase())) continue
    // A bare lowercase word is likely prose, not an identifier.
    if (/^[a-z]{1,3}$/u.test(value) && !/[0-9]/u.test(value)) continue
    add(value)
  }
  for (const match of text.matchAll(QUOTE_RE)) add(match[1])
  return [...found.values()]
}

function fidelityCheck(original, rewritten) {
  const tokens = hardTokens(original)
  const target = normalizeForMatch(rewritten)
  const missing = []
  for (const token of tokens) {
    const kept = variantsOf(token).some((variant) => variant !== '' && target.includes(variant))
    if (!kept) missing.push(token)
  }
  return { checked: tokens.length, missing }
}

function appendMissing(prompt, missing) {
  if (missing.length === 0) return prompt
  return `${prompt.trimEnd()}\n\n## 原文细节（照抄，勿改）\n${missing.map((item) => `- ${item}`).join('\n')}`
}

export const __test__ = {
  MODES,
  splitOriginal,
  splitClauses,
  bucketItems,
  localPrompt,
  hardTokens,
  fidelityCheck,
  chineseNumeral,
  variantsOf,
  stripOuterFence,
  normalizeSource,
  appendMissing,
  PromptCraft,
}
