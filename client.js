
window.__ModuleLoader__.load({
  id: 'dsh-plugin-prompt-craft',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'promptCraft'
    const ROUTE = 'api/prompt-craft'
    const MODES = [
      { id: 'standard', key: 'mode.standard', hint: 'mode.standard.hint' },
      { id: 'concise', key: 'mode.concise', hint: 'mode.concise.hint' },
      { id: 'detailed', key: 'mode.detailed', hint: 'mode.detailed.hint' },
      { id: 'structured', key: 'mode.structured', hint: 'mode.structured.hint' },
    ]

    const ZH = {
      'button.label': '提示词',
      'button.title': '把输入框里的文字改写成清晰、排版工整的提示词（标准 / 精简 / 详细 / 结构化）',
      'panel.title': '提示词美化',
      'panel.subtitle': '凌乱的原文 → 通俗、排版工整的提示词。原则：只调整表达，绝不省略、绝不曲解原文。',
      'panel.close': '关闭',
      'panel.source': '原始文字（可直接在这里改或粘贴）',
      'panel.placeholder': '把你想说的话直接打在这里，乱一点、啰嗦一点都没关系…',
      'panel.run': '改写',
      'panel.rerun': '重新改写',
      'panel.running': '正在改写…',
      'panel.emptySource': '先写点东西：输入框里没有文字，也可以直接在上面这块里粘贴。',
      'panel.result': '改写结果（预览）',
      'panel.resultHint': '{engine} · {mode} 模式',
      'panel.engine.llm': '模型改写',
      'panel.engine.local': '本地保真',
      'panel.copy': '复制',
      'panel.copied': '已复制到剪贴板',
      'panel.fill': '仅填入输入框',
      'panel.fillSend': '注入并发送',
      'panel.noComposer': '当前没有可写入的输入框，请先进入一个会话。',
      'panel.filled': '已注入输入框，按 Enter 发送',
      'panel.sent': '已注入并发送',
      'panel.failed': '改写失败',
      'panel.mode': '模式',
      'mode.standard': '标准',
      'mode.standard.hint': '清晰、能直接执行',
      'mode.concise': '精简',
      'mode.concise.hint': '压到最短，信息不少',
      'mode.detailed': '详细',
      'mode.detailed.hint': '补背景、步骤与自检',
      'mode.structured': '结构化',
      'mode.structured.hint': '固定骨架，便于机器读',
    }

    const EN = {
      'button.label': 'Prompt',
      'button.title': 'Rewrite what you typed into a clear, well-laid-out prompt (standard / concise / detailed / structured)',
      'panel.title': 'Prompt polish',
      'panel.subtitle': 'Messy notes → a plain-spoken, tidy prompt. The one rule: only the wording changes — nothing is dropped or bent.',
      'panel.close': 'Close',
      'panel.source': 'Original text (edit or paste it here)',
      'panel.placeholder': 'Type it however it comes out — messy and rambling is fine…',
      'panel.run': 'Rewrite',
      'panel.rerun': 'Rewrite again',
      'panel.running': 'Rewriting…',
      'panel.emptySource': 'Nothing to work with yet: the composer is empty, and this box is empty too.',
      'panel.result': 'Preview',
      'panel.resultHint': '{engine} · {mode} mode',
      'panel.engine.llm': 'model',
      'panel.engine.local': 'local (verbatim)',
      'panel.copy': 'Copy',
      'panel.copied': 'Copied to the clipboard',
      'panel.fill': 'Fill the composer',
      'panel.fillSend': 'Inject & send',
      'panel.noComposer': 'No composer to write into right now — open a session first.',
      'panel.filled': 'Injected into the composer — press Enter to send',
      'panel.sent': 'Injected and sent',
      'panel.failed': 'Rewrite failed',
      'panel.mode': 'Mode',
      'mode.standard': 'Standard',
      'mode.standard.hint': 'Clear and directly actionable',
      'mode.concise': 'Concise',
      'mode.concise.hint': 'Shortest form, no lost detail',
      'mode.detailed': 'Detailed',
      'mode.detailed.hint': 'Adds context, steps, self-check',
      'mode.structured': 'Structured',
      'mode.structured.hint': 'Fixed skeleton, easy to parse',
    }

    const STYLES = `
.pc-tool {
  box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px;
  height: 26px; padding: 0 8px; margin: 0 2px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28));
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary, #a8a8ad);
  transition: background .12s ease, color .12s ease;
}
.pc-tool:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); color: var(--dsw-alias-label-primary, #f5f5f5); }
.pc-tool:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 1px; }
.pc-tool[data-open="true"] { color: var(--dsw-alias-brand-primary, #4d6bfe); border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.pc-tool-label { white-space: nowrap; }
.pc-tool svg { flex: none; }

.pc-modal {
  pointer-events: auto; position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}
.pc-mask { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45)); }
.pc-card {
  box-sizing: border-box; position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px;
  width: min(620px, 100%); max-height: 100%; padding: 20px 22px 18px; overflow: hidden;
  border-radius: var(--dsw-radius-panel, 16px);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-overlay, #202024));
  box-shadow: var(--dsw-elevation-prominent, 0 16px 40px rgba(0,0,0,.36));
  color: var(--dsw-alias-label-primary, #f5f5f5);
}
.pc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pc-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.pc-subtitle { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #a8a8ad); }
.pc-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: none; border-radius: var(--dsw-radius-sm, 6px); background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary, #a8a8ad);
}
.pc-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.pc-modes { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-mode {
  box-sizing: border-box; display: inline-flex; align-items: baseline; gap: 6px;
  padding: 5px 10px; border-radius: var(--dsw-radius-md, 8px); cursor: pointer;
  border: .5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: transparent; color: var(--dsw-alias-label-secondary, #a8a8ad);
  font-family: inherit; font-size: 13px; line-height: 18px;
}
.pc-mode:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.pc-mode[aria-pressed="true"] {
  border-color: var(--dsw-alias-brand-primary, #4d6bfe);
  color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: var(--dsw-alias-brand-bg-subtle, rgba(77,107,254,.12));
}
.pc-mode-hint { font-size: 11px; opacity: .8; }
.pc-label { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary, #a8a8ad); }
.pc-area {
  box-sizing: border-box; width: 100%; min-height: 96px; max-height: 220px; resize: vertical;
  padding: 10px 12px; border-radius: var(--dsw-radius-md, 8px);
  border: .5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,.08));
  color: var(--dsw-alias-label-primary, #f5f5f5); font-family: inherit; font-size: 13px; line-height: 20px;
}
.pc-area:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.pc-result {
  box-sizing: border-box; flex: 1 1 auto; min-height: 120px; overflow-y: auto; overscroll-behavior: contain;
  margin: 0; padding: 12px; border-radius: var(--dsw-radius-md, 8px);
  border: .5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.24));
  background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06));
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px; line-height: 20px;
}
.pc-muted { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #a8a8ad); }
.pc-note { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #a8a8ad); }
.pc-note[data-warn="true"] { color: var(--dsw-alias-state-warning-primary, #d99b1f); }
.pc-error { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.pc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pc-grow { flex: 1 1 auto; min-width: 0; }
.pc-btn {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px;
  padding: 0 12px; border: none; border-radius: var(--dsw-radius-md, 8px); cursor: pointer;
  font-family: inherit; font-size: 13px; line-height: 20px; background: transparent;
  color: var(--dsw-alias-label-primary, #f5f5f5);
}
.pc-btn:disabled { opacity: .45; cursor: not-allowed; }
.pc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 1px; }
.pc-btn-outline { border: .5px solid var(--dsw-alias-border-l3, rgba(127,127,127,.4)); }
.pc-btn-outline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.pc-btn-primary { background: var(--dsw-alias-brand-primary, #4d6bfe); color: #fff; font-weight: 500; }
.pc-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
.pc-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pc-toast {
  pointer-events: auto; position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1001;
  max-width: min(560px, calc(100vw - 48px)); padding: 9px 16px; border-radius: var(--dsw-radius-md, 8px);
  border: .5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.24));
  background: var(--dsw-alias-bg-overlay, #26262a); color: var(--dsw-alias-label-primary, #f5f5f5);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.3));
  font-size: 13px; line-height: 20px;
}
.pc-toast[data-error="true"] { color: var(--dsw-alias-state-error-primary, #e5484d); }
`

    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        get: () => value,
        set(next) {
          value = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    const panelStore = createStore({
      open: false,
      source: '',
      mode: 'standard',
      busy: false,
      result: null,
      error: null,
    })
    const toastStore = createStore(null)
    let lastMode = 'standard'
    const composer = { setDraft: null, submit: null, sessionId: '', draft: null }

    function useStoreValue(store) {
      const [value, setValue] = React.useState(store.get())
      React.useEffect(() => {
        setValue(store.get())
        return store.subscribe(() => setValue(store.get()))
      }, [store])
      return value
    }

    function useStoreSelector(store, selector) {
      const selectorRef = React.useRef(selector)
      selectorRef.current = selector
      const [value, setValue] = React.useState(() => selector(store.get()))
      React.useEffect(() => {
        const read = () => setValue(selectorRef.current(store.get()))
        read()
        return store.subscribe(read)
      }, [store])
      return value
    }

    function insertStyles(css) {
      const element = document.createElement('style')
      element.setAttribute('data-dsh-plugin', 'prompt-craft')
      element.textContent = css
      document.head.appendChild(element)
      return () => element.remove()
    }

    function translator(t) {
      if (typeof t === 'function') return t
      return (key, params) => {
        const raw = ZH[key] ?? key
        if (params === undefined) return raw
        return raw.replace(/\{(\w+)\}/gu, (whole, name) => (name in params ? String(params[name]) : whole))
      }
    }

    function SparkIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M8 2.2l1.15 2.9L12 6.25 9.15 7.4 8 10.3 6.85 7.4 4 6.25l2.85-1.15z' }),
        h('path', { d: 'M12.4 10.2l.55 1.35 1.35.55-1.35.55-.55 1.35-.55-1.35L10.5 12.1l1.35-.55z' }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8' }),
        h('path', { d: 'M12 4l-8 8' }),
      )
    }

    async function callHost(endpoint, payload) {
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, payload }),
        })
        if (!response.ok) return { ok: false, message: `宿主路由返回 HTTP ${String(response.status)}` }
        const result = await response.json()
        if (result !== null && typeof result === 'object' && result.ok === true) return { ok: true, value: result.value }
        const error = result !== null && typeof result === 'object' ? result.error : undefined
        return {
          ok: false,
          code: typeof error?.code === 'string' ? error.code : undefined,
          message: typeof error?.message === 'string' ? error.message : '宿主机拒绝了这次改写',
        }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    }

    async function runRewrite(source, mode) {
      const current = panelStore.get()
      if (source.trim() === '') {
        panelStore.set({ ...current, mode, busy: false, result: null, error: { message: 'empty-source' } })
        return
      }
      panelStore.set({ ...current, mode, busy: true, error: null, result: null })
      const outcome = await callHost('polish', { text: source, mode })
      const latest = panelStore.get()
      if (latest.open === false) return
      if (outcome.ok === true) panelStore.set({ ...latest, busy: false, result: outcome.value, error: null })
      else panelStore.set({ ...latest, busy: false, result: null, error: { message: outcome.message } })
    }

    function notify(text, error = false) {
      toastStore.set({ text, error })
    }

    function openPanel(draft) {
      const source = typeof draft === 'string' ? draft : ''
      panelStore.set({ open: true, source, mode: lastMode, busy: source.trim() !== '', result: null, error: null })
      if (source.trim() !== '') void runRewrite(source, lastMode)
    }

    function closePanel() {
      const current = panelStore.get()
      if (current.busy === false) {
        panelStore.set({ ...current, open: false })
        return
      }
      panelStore.set({ ...current, open: false, busy: false })
    }

    function injectPrompt(prompt, send, say) {
      const t = typeof say === 'function' ? say : translator()
      if (typeof prompt !== 'string' || prompt === '') return
      if (typeof composer.setDraft !== 'function') {
        notify(t('panel.noComposer'), true)
        return
      }
      try {
        composer.setDraft(prompt)
      } catch (error) {
        notify(`写入输入框失败：${error instanceof Error ? error.message : String(error)}`, true)
        return
      }
      closePanel()
      if (send !== true) {
        notify(t('panel.filled'))
        return
      }
      notify(t('panel.sent'))
      // `setDraft` commits the editor synchronously, but the submit machine owns
      // its own transaction, so the send goes out one task later instead of
      // racing the editor commit.
      setTimeout(() => {
        try {
          if (typeof composer.submit === 'function') composer.submit()
        } catch (error) {
          notify(`发送失败，请手动按 Enter：${error instanceof Error ? error.message : String(error)}`, true)
          return
        }
        // The draft the button reports back is the only proof the composer took
        // the text: a submission clears it, a stuck draft means the send did not
        // happen and the reader has to press Enter themselves.
        setTimeout(() => {
          if (typeof composer.draft === 'string' && composer.draft.trim() === prompt.trim()) {
            notify(t('panel.filled'), true)
          }
        }, 400)
      }, 60)
    }

    function PromptCraftButton(props) {
      const t = translator(props.t)
      // Standard slot props arrive flat; the fallbacks keep the button working
      // if a shell nests them under an inject face instead.
      const inputActions = props.inputActions ?? props.inject?.inputActions
      const useInput = props.useInput ?? props.inject?.useInput
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
      const open = useStoreSelector(panelStore, (state) => state.open)
      // Stable reference for this mount: the prop names the bound session.
      const useDraft = typeof useInput === 'function' ? useInput : null
      const draft = useDraft === null ? '' : useDraft((state) => (state !== null && typeof state?.draft === 'string' ? state.draft : ''))
      React.useEffect(() => {
        composer.setDraft = typeof inputActions?.setDraft === 'function' ? inputActions.setDraft : null
        composer.submit = typeof inputActions?.submit === 'function' ? inputActions.submit : null
        composer.sessionId = sessionId
        composer.draft = draft
      }, [inputActions, sessionId, draft])
      return h(
        'button',
        {
          type: 'button',
          className: 'pc-tool',
          'data-open': open ? 'true' : 'false',
          title: t('button.title'),
          'aria-label': t('button.title'),
          'aria-expanded': open,
          onClick: () => (open ? closePanel() : openPanel(draft)),
        },
        h(SparkIcon, null),
        h('span', { className: 'pc-tool-label' }, t('button.label')),
      )
    }

    function ModeRow({ state, t }) {
      return h(
        'div',
        { className: 'pc-modes', role: 'group', 'aria-label': t('panel.mode') },
        MODES.map((mode) => h(
          'button',
          {
            key: mode.id,
            type: 'button',
            className: 'pc-mode',
            'aria-pressed': state.mode === mode.id,
            disabled: state.busy,
            title: t(mode.hint),
            onClick: () => {
              if (state.mode === mode.id && state.result !== null) return
              lastMode = mode.id
              const current = panelStore.get()
              if (current.source.trim() === '') {
                panelStore.set({ ...current, mode: mode.id, result: null, error: null })
                return
              }
              void runRewrite(current.source, mode.id)
            },
          },
          t(mode.key),
          h('span', { className: 'pc-mode-hint' }, t(mode.hint)),
        )),
      )
    }

    function PromptCraftPanel(props) {
      const t = translator(props.t)
      const state = useStoreValue(panelStore)
      const toast = useStoreValue(toastStore)
      const areaRef = React.useRef(null)
      React.useEffect(() => {
        if (toast === null) return undefined
        const timer = setTimeout(() => toastStore.set(null), 3800)
        return () => clearTimeout(timer)
      }, [toast])
      React.useEffect(() => {
        if (state.open === false) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closePanel()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.open])
      React.useEffect(() => {
        if (state.open && state.source === '') areaRef.current?.focus()
      }, [state.open, state.source])
      const notice = toast === null
        ? null
        : h('div', { className: 'pc-toast', role: 'status', 'data-error': toast.error ? 'true' : 'false' }, toast.text)
      if (state.open === false) return notice
      const result = state.result
      const prompt = typeof result?.prompt === 'string' ? result.prompt : ''
      const engine = result?.engine === 'local' ? t('panel.engine.local') : t('panel.engine.llm')
      const modeLabel = (MODES.find((mode) => mode.id === state.mode) ?? MODES[0]).key
      const canInject = prompt !== '' && typeof composer.setDraft === 'function'
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'pc-modal', role: 'presentation' },
          h('div', { className: 'pc-mask', onClick: closePanel, 'aria-hidden': true }),
          h(
            'div',
            { className: 'pc-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.title') },
            h(
              'div',
              { className: 'pc-head' },
              h('div', null,
                h('h2', { className: 'pc-title' }, t('panel.title')),
                h('p', { className: 'pc-subtitle' }, t('panel.subtitle'))),
              h('button', { type: 'button', className: 'pc-close', 'aria-label': t('panel.close'), onClick: closePanel }, h(CloseIcon, null)),
            ),
            h(ModeRow, { state, t }),
            h('div', null,
              h('div', { className: 'pc-label', style: { marginBottom: '4px' } }, t('panel.source')),
              h('textarea', {
                ref: areaRef,
                className: 'pc-area',
                value: state.source,
                placeholder: t('panel.placeholder'),
                spellCheck: false,
                onChange: (event) => {
                  const next = event.target.value
                  const current = panelStore.get()
                  panelStore.set({ ...current, source: next, result: null, error: null })
                },
                onKeyDown: (event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void runRewrite(panelStore.get().source, panelStore.get().mode)
                  }
                },
              })),
            h(
              'div',
              { className: 'pc-row' },
              h('button', {
                type: 'button',
                className: 'pc-btn pc-btn-outline',
                disabled: state.busy,
                onClick: () => {
                  const current = panelStore.get()
                  void runRewrite(current.source, current.mode)
                },
              }, state.busy ? t('panel.running') : (result === null ? t('panel.run') : t('panel.rerun'))),
              h('span', { className: 'pc-muted pc-grow' },
                state.source.trim() === '' ? t('panel.emptySource') : ''),
              result === null ? null : h('span', { className: 'pc-muted' }, t('panel.resultHint', {
                engine,
                mode: t(modeLabel),
              })),
            ),
            state.error === null ? null : h('p', { className: 'pc-error', role: 'alert' },
              state.error.message === 'empty-source' ? t('panel.emptySource') : `${t('panel.failed')}：${state.error.message}`),
            result === null ? null : h('div', { className: 'pc-result', 'aria-label': t('panel.result') }, prompt),
            result === null || typeof result.note !== 'string' ? null : h(
              'p',
              {
                className: 'pc-note',
                'data-warn': result.fidelity?.missing?.length > 0 || result.engine === 'local' ? 'true' : 'false',
              },
              result.note,
            ),
            h(
              'div',
              { className: 'pc-foot' },
              h('div', { className: 'pc-row' },
                h('button', {
                  type: 'button',
                  className: 'pc-btn pc-btn-outline',
                  disabled: prompt === '',
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(prompt)
                      notify(t('panel.copied'))
                    } catch {
                      notify(t('panel.copied'), true)
                    }
                  },
                }, t('panel.copy')),
                h('button', {
                  type: 'button',
                  className: 'pc-btn pc-btn-outline',
                  disabled: canInject === false,
                  title: canInject ? '' : t('panel.noComposer'),
                  onClick: () => injectPrompt(prompt, false, t),
                }, t('panel.fill'))),
              h('button', {
                type: 'button',
                className: 'pc-btn pc-btn-primary',
                disabled: canInject === false,
                title: canInject ? '' : t('panel.noComposer'),
                onClick: () => injectPrompt(prompt, true, t),
              }, t('panel.fillSend')),
            ),
          ),
        ),
        notice,
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => insertStyles(STYLES), 'prompt-craft: styles')
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'prompt-craft: dictionaries')

      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'prompt-craft.toolbar',
        order: 40,
        locale: NS,
        inject: () => ({}),
      }, PromptCraftButton))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'prompt-craft.panel',
        order: 700,
        locale: NS,
        inject: () => ({}),
      }, PromptCraftPanel))
    }

    return { inject, apply, MODES, PromptCraftButton, PromptCraftPanel, openPanel, closePanel, injectPrompt }
  },
})
