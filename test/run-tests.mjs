
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply as hostApply, inject as hostInject, __test__ as host } from '../index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')

let passed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    return
  }
  failures.push(detail === '' ? name : `${name} — ${detail}`)
}

function checkEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(name, a === b, `expected ${b}, got ${a}`)
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Sample input: deliberately messy, long-winded, with hard details to preserve

const MESSY = [
  '嗯，那个，我这边有个脚本跑完以后会输出一大堆日志，反正就是很长很长那种，',
  '帮我总结一下，然后注意不要漏掉 ERROR 开头的行，一共只有 12 条，',
  '输出成 Markdown 表格，文件名叫 report_2026.csv，',
  '就是说我想要一眼能看出哪几条是致命错误，别给我贴整段日志。',
].join('')

const ORIGINAL_SENTENCES = host.splitOriginal(host.normalizeSource(MESSY))

// Host half: sentence splitting, bucketing, and the local engine

{
  check('inject declares the two host services', JSON.stringify(hostInject) === JSON.stringify(['connection', 'llm']))
  check('splitOriginal keeps a usable number of sentences', ORIGINAL_SENTENCES.length >= 4,
    `got ${String(ORIGINAL_SENTENCES.length)}: ${JSON.stringify(ORIGINAL_SENTENCES)}`)
  const joined = ORIGINAL_SENTENCES.join('')
  for (const must of ['ERROR', '12', 'Markdown', 'report_2026.csv', '致命错误', '不要漏掉']) {
    check(`splitOriginal keeps "${must}"`, joined.includes(must))
  }
  // The local engine may drop a leading verbal filler, but never a fact.
  check('splitOriginal strips the leading filler only', ORIGINAL_SENTENCES[0].startsWith('我这边有个脚本'), ORIGINAL_SENTENCES[0])
}

{
  const buckets = host.bucketItems(ORIGINAL_SENTENCES)
  const all = [...buckets.goal, ...buckets.constraints, ...buckets.output, ...buckets.detail]
  check('every sentence lands in exactly one bucket', all.length === ORIGINAL_SENTENCES.length,
    `${String(all.length)} vs ${String(ORIGINAL_SENTENCES.length)}`)
  check('a goal sentence was recognised', buckets.goal.length > 0, JSON.stringify(buckets.goal))
  check('the "不要漏掉" sentence is a constraint',
    buckets.constraints.some((item) => item.includes('不要漏掉')), JSON.stringify(buckets.constraints))
}

{
  for (const mode of ['standard', 'concise', 'detailed', 'structured']) {
    const prompt = host.localPrompt(host.normalizeSource(MESSY), mode)
    check(`local/${mode} produces text`, prompt.trim() !== '')
    for (const sentence of ORIGINAL_SENTENCES) {
      check(`local/${mode} keeps the sentence "${sentence.slice(0, 12)}…"`, prompt.includes(sentence))
    }
    const fidelity = host.fidelityCheck(MESSY, prompt)
    check(`local/${mode} keeps every hard detail`, fidelity.missing.length === 0, JSON.stringify(fidelity.missing))
    check(`local/${mode} has a heading`, /^#{1,2} /mu.test(prompt))
  }
  const concise = host.localPrompt(host.normalizeSource(MESSY), 'concise')
  check('concise is shorter than detailed',
    concise.length < host.localPrompt(host.normalizeSource(MESSY), 'detailed').length)
  check('structured uses the fixed skeleton', host.localPrompt(host.normalizeSource(MESSY), 'structured').includes('## 目标'))
}

// Host half: the fidelity guard

{
  const missing = host.fidelityCheck(MESSY, '# 任务\n帮我总结一下日志。')
  check('fidelityCheck notices dropped details', missing.missing.length >= 3, JSON.stringify(missing))
  check('fidelityCheck counts the details it checked', missing.checked >= 3, String(missing.checked))

  check('fidelityCheck accepts a faithful rewrite',
    host.fidelityCheck(MESSY, '# 任务\n把 report_2026.csv 里 ERROR 开头的 12 条记录整理成 Markdown 表格，不要漏掉，也别贴整段日志，要能一眼看出致命错误。').missing.length === 0)

  check('chineseNumeral(12) is 十二', host.chineseNumeral(12) === '十二')
  check('chineseNumeral(105) is 一百零五', host.chineseNumeral(105) === '一百零五')
  const variants = host.variantsOf('12')
  check('a number also matches its Chinese spelling', variants.includes('十二'), JSON.stringify(variants))
  const percentVariants = host.variantsOf('50%')
  check('a percentage also matches 百分之…', percentVariants.some((variant) => variant.includes('百分之')), JSON.stringify(percentVariants))

  const patched = host.appendMissing('# 任务\n做点什么', ['report_2026.csv', 'ERROR'])
  check('appendMissing re-attaches details verbatim', patched.includes('- report_2026.csv') && patched.includes('## 原文细节'))

  check('a whole-answer fence is unwrapped', host.stripOuterFence('```markdown\n# 任务\n做点什么\n```') === '# 任务\n做点什么')
  check('an inner fence is left alone', host.stripOuterFence('```markdown\n# 任务\n```js\nx\n```\n```').includes('```js'))
}

// Host half: the model path, its repair step, and both fallbacks

function scriptedLlm(answers) {
  let index = 0
  return {
    calls: 0,
    stream() {
      const answer = answers[Math.min(index, answers.length - 1)]
      index += 1
      this.calls += 1
      return (async function* generate() {
        if (answer instanceof Error) throw answer
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: answer }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

function fakeCtx(llm) {
  return {
    llm,
    get(name) {
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) }
      return undefined
    },
  }
}

const SOURCE = host.normalizeSource(MESSY)

{
  const good = '# 任务\n把 report_2026.csv 里 ERROR 开头的 12 条记录整理成 Markdown 表格。\n\n## 约束\n- 不要漏掉任何一条\n- 不要贴整段日志\n\n## 输出要求\n- 一眼能看出哪几条是致命错误'
  const llm = scriptedLlm([good])
  const craft = new host.PromptCraft(fakeCtx(llm), {})
  const result = await craft.polish(SOURCE, 'standard')
  checkEqual('a faithful model answer is used as-is', result.engine, 'llm')
  checkEqual('the model route is reported', result.model, 'test-provider/test-model')
  checkEqual('no detail was missing', result.fidelity.missing, [])
  checkEqual('only one model call was needed', llm.calls, 1)
  checkEqual('the prompt is the model answer', result.prompt, good)
}

{
  const lossy = '# 任务\n帮我总结日志。'
  const repaired = '# 任务\n帮我总结日志。\n\n## 约束\n- report_2026.csv'
  const llm = scriptedLlm([lossy, repaired])
  const craft = new host.PromptCraft(fakeCtx(llm), {})
  const result = await craft.polish(SOURCE, 'standard')
  checkEqual('a retry is attempted before repairing', llm.calls, 2)
  check('a better retry replaces the first answer', result.prompt.includes('report_2026.csv'))
  checkEqual('the retry still misses details', result.fidelity.patched, true)
  checkEqual('the retry is still a model rewrite', result.engine, 'llm')
}

{
  const useless = '# 任务\n帮我总结一下。'
  const llm = scriptedLlm([useless, useless])
  const craft = new host.PromptCraft(fakeCtx(llm), {})
  const result = await craft.polish(SOURCE, 'standard')
  checkEqual('a rewrite that loses too much falls back to the local engine', result.engine, 'local')
  check('the fallback note explains why', result.note.includes('本地保真'), result.note)
  for (const sentence of ORIGINAL_SENTENCES) check('the fallback keeps every sentence', result.prompt.includes(sentence))
}

{
  const llm = scriptedLlm([new Error('provider unreachable')])
  const craft = new host.PromptCraft(fakeCtx(llm), {})
  const result = await craft.polish(SOURCE, 'structured')
  checkEqual('a model failure falls back to the local engine', result.engine, 'local')
  check('the failure reason reaches the panel', result.note.includes('provider unreachable'), result.note)
  checkEqual('the fallback still honours the mode', result.mode, 'structured')
}

{
  // `handle` is the route's own fold: envelope, refusals, and the local engine.
  const craft = new host.PromptCraft(fakeCtx(scriptedLlm(['x'])), {})
  const empty = await craft.handle('polish', { text: '   ' })
  checkEqual('empty input is refused with a code', empty.ok, false)
  checkEqual('empty input uses the documented code', empty.error.code, 'prompt-craft/empty-input')

  const huge = await craft.handle('polish', { text: 'a'.repeat(20001) })
  checkEqual('oversized input is refused', huge.ok, false)
  checkEqual('oversized input uses the documented code', huge.error.code, 'prompt-craft/too-long')

  const described = await craft.handle('describe', {})
  checkEqual('describe lists four modes', described.value.modes.map((mode) => mode.id),
    ['standard', 'concise', 'detailed', 'structured'])
  checkEqual('describe reports a route', described.value.route.provider, 'test-provider')

  const forced = await craft.handle('local', { text: '帮我看看这个。', mode: 'concise' })
  checkEqual('the local endpoint never calls the model', forced.value.engine, 'local')

  const badEndpoint = await craft.handle('nope', { text: '有内容' })
  checkEqual('an unknown endpoint is refused', badEndpoint.error.code, 'prompt-craft/unknown-endpoint')
}

{
  const craft = new host.PromptCraft(fakeCtx(scriptedLlm(['x'])), {})
  const bad = await craft.respond({ json: async () => { throw new Error('not json') } })
  checkEqual('a non-JSON body answers 400', bad.status, 400)
  const good = await craft.respond({ json: async () => ({ endpoint: 'describe', payload: {} }) })
  checkEqual('the route answers 200 for a good body', good.status, 200)
  const decoded = await good.json()
  checkEqual('the route answers in the shared envelope', decoded.ok, true)
}

// Client half: a React stand-in good enough to run the real components

function createReactStub() {
  const state = new Map()
  const cleanups = []
  let key = ''
  let cursor = 0
  let queue = []
  const React = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      const merged = props === null || props === undefined ? {} : { ...props }
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      return { type, props: merged }
    },
    useState(initial) {
      const slots = state.get(key) ?? []
      const index = cursor
      cursor += 1
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      state.set(key, slots)
      const set = (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }
      return [slots[index], set]
    },
    useEffect(fn) {
      cursor += 1
      queue.push(fn)
    },
    useRef(initial) {
      const slots = state.get(key) ?? []
      const index = cursor
      cursor += 1
      if (!(index in slots)) slots[index] = { current: initial }
      state.set(key, slots)
      return slots[index]
    },
  }
  return {
    React,
    begin(renderKey) {
      key = renderKey
      cursor = 0
      queue = []
    },
    flush() {
      const pending = [...queue]
      queue = []
      for (const effect of pending) {
        const dispose = effect()
        if (typeof dispose === 'function') cleanups.push(dispose)
      }
    },
    disposeAll() {
      for (const dispose of cleanups.splice(0)) dispose()
    },
  }
}

function render(stub, renderKey, Component, props) {
  stub.begin(renderKey)
  const tree = Component(props)
  stub.flush()
  return tree
}

function expand(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  if (typeof node.type !== 'function') return node
  return expand(node.type(node.props))
}

function textOf(node, out = []) {
  node = expand(node)
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, out)
    return out
  }
  if (typeof node === 'object' && 'props' in node) textOf(node.props.children, out)
  return out
}

function classesOf(node, out = new Set()) {
  node = expand(node)
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) classesOf(child, out)
    return out
  }
  if (!('props' in node)) return out
  const className = node.props?.className
  if (typeof className === 'string') for (const name of className.split(/\s+/u)) if (name !== '') out.add(name)
  classesOf(node.props?.children, out)
  return out
}

function elementsOf(node, type, out = []) {
  node = expand(node)
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, type, out)
    return out
  }
  if (!('props' in node)) return out
  if (node.type === type) out.push(node)
  elementsOf(node.props?.children, type, out)
  return out
}

async function loadClient() {
  const source = readFileSync(join(PKG, 'client.js'), 'utf8')
  const stub = createReactStub()
  let registration
  const windowStub = {
    __ModuleLoader__: { load: (value) => { registration = value } },
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = {
    createElement: () => ({ setAttribute() {}, textContent: '', remove() {} }),
    head: { appendChild() {} },
  }
  const factory = new Function('window', 'document', 'navigator', source)
  factory(windowStub, documentStub, { clipboard: { writeText: async () => {} } })
  check('the client bundle registers itself with the module loader', registration !== undefined)
  const exported = registration.factory((specifier) => {
    if (specifier === 'react') return stub.React
    throw new Error(`unexpected require: ${specifier}`)
  })
  return { exported, stub, windowStub, documentStub }
}

{
  const { exported } = await loadClient()
  checkEqual('the client injects slots and locale', exported.inject, ['slots', 'locale'])
  const registrations = []
  const ctx = {
    effect: (fn) => { fn() },
    locale: { register: (namespace, dictionaries) => { registrations.push({ namespace, dictionaries }) } },
    slots: {
      inject: (name, loader) => loader(),
      register: (options, component) => { registrations.push({ ...options, component }) },
    },
  }
  exported.apply(ctx)
  const slots = registrations.filter((entry) => typeof entry.name === 'string')
  checkEqual('three slots are contributed', slots.map((entry) => entry.name), ['conversation.input.left', 'conversation.input.left', 'shell.overlay'])
  checkEqual('the composer button keeps its id', slots[0].id, 'prompt-craft.toolbar')
  checkEqual('the undo button sits beside it', slots[1].id, 'prompt-craft.undo')
  checkEqual('the panel keeps its id', slots[2].id, 'prompt-craft.panel')
  check('both slots name this bundle as their locale namespace',
    slots.every((entry) => entry.locale === 'promptCraft'))
  check('both slots carry a component', slots.every((entry) => typeof entry.component === 'function'))
  checkEqual('zh and en dictionaries are registered',
    Object.keys(registrations.find((entry) => entry.dictionaries !== undefined).dictionaries), ['zh', 'en'])
}

{
  // The toolbar button: renders, reads the draft, and opens the panel.
  const { exported, stub } = await loadClient()
  const drafts = ['请把我这段乱七八糟的话捋顺']
  const actions = { setDraft: (text) => drafts.push(text), submit: () => drafts.push('<submit>') }
  const props = {
    inputActions: actions,
    useInput: (selector) => selector({ draft: drafts[0] }),
    sessionId: 'session-test',
    t: undefined,
  }
  const tree = render(stub, 'button', exported.PromptCraftButton, props)
  check('the button renders a button element', tree.type === 'button')
  checkEqual('the button is the tool-row pill', tree.props.className, 'pc-tool')
  check('the button carries a tooltip', typeof tree.props.title === 'string' && tree.props.title.length > 0)
  check('the button shows its label', textOf(tree).join('').includes('提示词'), textOf(tree).join(''))

  // Injecting needs the composer handle, which the button wires in its effect.
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, value: {} }) })
  exported.injectPrompt('# 任务\n做点什么', true)
  await tick(120)
  checkEqual('injection writes the prompt into the composer', drafts[1], '# 任务\n做点什么')
  checkEqual('injection then submits', drafts[2], '<submit>')
}

{
  // The panel: fetch is stubbed, so this exercises open → rewrite → preview.
  const { exported, stub } = await loadClient()
  const rewritten = '# 任务\n把 report_2026.csv 里 ERROR 开头的 12 条记录整理成 Markdown 表格。\n\n## 约束\n- 不要漏掉任何一条'
  let seen = null
  globalThis.fetch = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        value: {
          prompt: rewritten,
          mode: 'standard',
          engine: 'llm',
          model: 'test-provider/test-model',
          fidelity: { checked: 4, missing: [], patched: false },
          note: '已由模型改写，并逐条核对。',
        },
      }),
    }
  }
  const actions = { setDraft: () => {}, submit: () => {} }
  const props = { inputActions: actions, useInput: (selector) => selector({ draft: MESSY }), sessionId: 's', t: undefined }
  render(stub, 'button', exported.PromptCraftButton, props)
  exported.openPanel(MESSY)
  await tick(20)
  checkEqual('the panel calls the documented route', seen.url, 'api/prompt-craft')
  checkEqual('the panel asks for the standard mode', seen.body.payload.mode, 'standard')
  check('the panel sends the original text', seen.body.payload.text === MESSY)

  const tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  const text = textOf(tree).join('')
  check('the panel renders its title', text.includes('提示词美化'), text.slice(0, 120))
  check('the panel shows the preview', text.includes('report_2026.csv'))
  check('the panel shows the engine note', text.includes('已由模型改写'))
  const classes = classesOf(tree)
  for (const name of ['pc-card', 'pc-modal', 'pc-mode', 'pc-result', 'pc-btn-primary']) {
    check(`the panel renders .${name}`, classes.has(name))
  }
  const chips = elementsOf(tree, 'button').filter((node) => node.props.className === 'pc-mode')
  checkEqual('four mode chips are offered', chips.length, 4)
  checkEqual('the selected chip is pressed', chips[0].props['aria-pressed'], true)
  check('the primary action is one-click inject-and-send',
    text.includes('注入并发送'))
}

{
  // The undo pill appears after a fill and restores the pre-rewrite draft.
  const { exported, stub } = await loadClient()
  const drafts = ['原始文字']
  const actions = { setDraft: (text) => drafts.push(text), submit: () => {} }
  const baseProps = {
    inputActions: actions,
    useInput: (selector) => selector({ draft: drafts[0] }),
    sessionId: 's',
    t: undefined,
  }
  render(stub, 'button', exported.PromptCraftButton, baseProps)
  exported.injectPrompt('改写后的文字', false)
  await tick(5)
  checkEqual('fill writes the rewritten draft', drafts.at(-1), '改写后的文字')

  const undo = render(stub, 'undo', exported.PromptCraftUndoButton, {
    ...baseProps,
    useInput: (selector) => selector({ draft: '改写后的文字' }),
  })
  check('the undo pill appears after a fill', undo !== null)
  check('the undo pill says 回退', textOf(undo).join('').includes('回退'))
  undo.props.onClick()
  checkEqual('undo restores the original draft', drafts.at(-1), '原始文字')
}

{
  // Cache: the same original text + mode must not call the host twice.
  const { exported, stub } = await loadClient()
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls += 1
    const payload = JSON.parse(init.body).payload
    return {
      ok: true,
      json: async () => ({
        ok: true,
        value: {
          prompt: `${payload.mode} → ${payload.text}`,
          mode: payload.mode,
          engine: 'llm',
          note: '',
          fidelity: { missing: [] },
        },
      }),
    }
  }
  const actions = { setDraft: () => {}, submit: () => {} }
  const props = { inputActions: actions, useInput: (selector) => selector({ draft: MESSY }), sessionId: 's', t: undefined }
  render(stub, 'button', exported.PromptCraftButton, props)
  exported.openPanel(MESSY)
  await tick(20)
  checkEqual('the first open triggers one rewrite', calls, 1)

  let tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  let chips = elementsOf(tree, 'button').filter((node) => node.props.className === 'pc-mode')
  chips[1].props.onClick()
  await tick(20)
  checkEqual('switching mode triggers a second rewrite', calls, 2)

  tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  chips = elementsOf(tree, 'button').filter((node) => node.props.className === 'pc-mode')
  chips[0].props.onClick()
  await tick(20)
  checkEqual('switching back uses the cached result', calls, 2)
  check('the cached preview is the standard one', textOf(render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })).join('').includes('standard →'))
}

{
  // Revert: the original text goes back into the source box and the composer.
  const { exported, stub } = await loadClient()
  const drafts = []
  globalThis.fetch = async (_url, init) => ({
    ok: true,
    json: async () => ({
      ok: true,
      value: { prompt: '# 改写结果', mode: JSON.parse(init.body).payload.mode, engine: 'llm', note: '', fidelity: { missing: [] } },
    }),
  })
  const actions = { setDraft: (text) => drafts.push(text), submit: () => {} }
  const props = { inputActions: actions, useInput: (selector) => selector({ draft: MESSY }), sessionId: 's', t: undefined }
  render(stub, 'button', exported.PromptCraftButton, props)
  exported.openPanel(MESSY)
  await tick(20)

  const tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  const revert = elementsOf(tree, 'button').find((node) => textOf(node).join('').includes('回退原文'))
  check('the panel offers a revert button', revert !== undefined)
  check('revert is enabled once there is a rewrite', revert.props.disabled === false)
  revert.props.onClick()
  await tick(5)

  const after = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  const area = elementsOf(after, 'textarea')[0]
  checkEqual('revert restores the source box', area.props.value, MESSY)
  checkEqual('revert restores the composer', drafts.at(-1), MESSY)
}

{
  // Reopening after a fill must start from the original, not the rewritten draft.
  const { exported, stub } = await loadClient()
  globalThis.fetch = async (_url, init) => ({
    ok: true,
    json: async () => ({
      ok: true,
      value: { prompt: '# 改写结果', mode: JSON.parse(init.body).payload.mode, engine: 'llm', note: '', fidelity: { missing: [] } },
    }),
  })
  const actions = { setDraft: () => {}, submit: () => {} }
  const props = { inputActions: actions, useInput: (selector) => selector({ draft: MESSY }), sessionId: 's', t: undefined }
  render(stub, 'button', exported.PromptCraftButton, props)
  exported.openPanel(MESSY)
  await tick(20)
  exported.injectPrompt('# 改写结果', false)
  await tick(5)
  exported.openPanel('# 改写结果')
  await tick(20)

  const tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  const area = elementsOf(tree, 'textarea')[0]
  checkEqual('reopening after fill restores the original source', area.props.value, MESSY)
}

{
  // Error path: the host refuses, and the panel shows why without injecting.
  const { exported, stub } = await loadClient()
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: false, error: { code: 'prompt-craft/empty-input', message: '原始文字是空的：先把要改写的文字放进输入框，或直接粘进面板。' } }),
  })
  const actions = { setDraft: () => {}, submit: () => {} }
  const props = { inputActions: actions, useInput: (selector) => selector({ draft: '有内容' }), sessionId: 's', t: undefined }
  render(stub, 'button', exported.PromptCraftButton, props)
  exported.openPanel('有内容')
  await tick(20)
  const tree = render(stub, 'panel', exported.PromptCraftPanel, { t: undefined })
  const text = textOf(tree).join('')
  check('a refusal is shown to the reader', text.includes('原始文字是空的'))
  check('no preview is rendered on failure', classesOf(tree).has('pc-result') === false)
}

const total = passed + failures.length
console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${String(passed)}/${String(total)} assertions`)
for (const failure of failures) console.log(`  ✗ ${failure}`)
process.exitCode = failures.length === 0 ? 0 : 1
