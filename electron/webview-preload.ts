const { ipcRenderer } = require('electron')

interface BotAdapter {
  name: string
  matches(hostname: string): boolean
  getInputElement(): HTMLElement | null
  getSendButton(): HTMLButtonElement | HTMLElement | null
  getStopButton(): HTMLElement | null
  getNewChatButton?(): HTMLElement | null
  getLastResponseText(): string | null
  scrapeQuota?(bodyText: string): { type: 'percentage' | 'limit' | 'remaining'; data: any } | null
}

const adapters: BotAdapter[] = [
  // 1. ChatGPT Adapter
  {
    name: 'ChatGPT',
    matches: (h) => h.includes('chatgpt.com') || h.includes('openai.com'),
    getInputElement: () => {
      return (
        document.querySelector<HTMLElement>('#prompt-textarea') ||
        document.querySelector<HTMLElement>('div[contenteditable="true"]#prompt-textarea') ||
        document.querySelector<HTMLElement>('textarea[data-id="root"]') ||
        document.querySelector<HTMLElement>('div.ProseMirror') ||
        document.querySelector<HTMLElement>('div[contenteditable="true"]')
      )
    },
    getSendButton: () => {
      return (
        document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]') ||
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send prompt" i]') ||
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send message" i]') ||
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send" i]')
      )
    },
    getStopButton: () => {
      return (
        document.querySelector<HTMLElement>('button[data-testid="stop-button"]') ||
        document.querySelector<HTMLElement>('button[aria-label*="Stop streaming" i]') ||
        document.querySelector<HTMLElement>('button[aria-label*="Stop generating" i]') ||
        document.querySelector<HTMLElement>('button[aria-label*="Stop" i]')
      )
    },
    getNewChatButton: () => {
      return document.querySelector<HTMLElement>('a[href="/"]') || document.querySelector<HTMLElement>('button[aria-label*="New chat" i]')
    },
    getLastResponseText: () => {
      const messages = document.querySelectorAll<HTMLElement>(
        '[data-message-author-role="assistant"], div.agent-turn, .markdown-body'
      )
      if (messages.length === 0) return null
      const last = messages[messages.length - 1]
      return last.innerText?.trim() || last.textContent?.trim() || null
    },
    scrapeQuota: (bodyText: string) => {
      const match = bodyText.match(/(\d+)\s*\/\s*(\d+)/)
      if (match) {
        return { type: 'limit', data: { current: parseInt(match[1]), max: parseInt(match[2]) } }
      }
      return null
    }
  },

  // 2. Google Gemini Adapter
  {
    name: 'Gemini',
    matches: (h) => h.includes('gemini.google.com'),
    getInputElement: () => {
      return (
        document.querySelector<HTMLElement>('rich-textarea div[contenteditable="true"]') ||
        document.querySelector<HTMLElement>('div[role="textbox"]') ||
        document.querySelector<HTMLElement>('div.ql-editor') ||
        document.querySelector<HTMLElement>('div[contenteditable="true"]')
      )
    },
    getSendButton: () => {
      return (
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send" i]') ||
        document.querySelector<HTMLButtonElement>('button.send-button') ||
        document.querySelector<HTMLButtonElement>('button[mat-icon-button][aria-label*="Send" i]') ||
        document.querySelector<HTMLButtonElement>('send-button button')
      )
    },
    getStopButton: () => {
      return (
        document.querySelector<HTMLElement>('button[aria-label*="Stop" i]') ||
        document.querySelector<HTMLElement>('button.stop-button')
      )
    },
    getNewChatButton: () => {
      return (
        document.querySelector<HTMLElement>('a[href*="/app"]') ||
        document.querySelector<HTMLElement>('span.new-chat-button') ||
        document.querySelector<HTMLElement>('button[aria-label*="New chat" i]')
      )
    },
    getLastResponseText: () => {
      const messages = document.querySelectorAll<HTMLElement>(
        '.model-response-text, message-content, .response-container'
      )
      if (messages.length === 0) return null
      const last = messages[messages.length - 1]
      return last.innerText?.trim() || last.textContent?.trim() || null
    },
    scrapeQuota: (bodyText: string) => {
      const match = bodyText.match(/Current usage[\s\S]{0,100}?(\d+)%\s*used/i)
      if (match) {
        return { type: 'percentage', data: { percentage: parseInt(match[1]) } }
      }
      return null
    }
  },

  // 3. Anthropic Claude Adapter
  {
    name: 'Claude',
    matches: (h) => h.includes('claude.ai'),
    getInputElement: () => {
      return (
        document.querySelector<HTMLElement>('div.ProseMirror[contenteditable="true"]') ||
        document.querySelector<HTMLElement>('fieldset div[contenteditable="true"]') ||
        document.querySelector<HTMLElement>('div[contenteditable="true"]')
      )
    },
    getSendButton: () => {
      return (
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send" i]') ||
        document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]') ||
        document.querySelector<HTMLButtonElement>('fieldset button:last-child')
      )
    },
    getStopButton: () => {
      return (
        document.querySelector<HTMLElement>('button[aria-label*="Stop" i]') ||
        document.querySelector<HTMLElement>('button[data-testid="stop-button"]')
      )
    },
    getNewChatButton: () => {
      return (
        document.querySelector<HTMLElement>('a[href="/new"]') ||
        document.querySelector<HTMLElement>('button[aria-label*="New chat" i]')
      )
    },
    getLastResponseText: () => {
      const messages = document.querySelectorAll<HTMLElement>(
        '.font-claude-message, div[data-is-streaming], div.standard-markdown'
      )
      if (messages.length === 0) return null
      const last = messages[messages.length - 1]
      return last.innerText?.trim() || last.textContent?.trim() || null
    },
    scrapeQuota: (bodyText: string) => {
      const percentMatch = bodyText.match(/Current session[\s\S]{0,100}?(\d+)%\s*used/i)
      if (percentMatch) {
        return { type: 'percentage', data: { percentage: parseInt(percentMatch[1]) } }
      }
      const remainingMatch = bodyText.match(/(\d+)\s*message[s]?\s*remaining/i)
      if (remainingMatch) {
        return { type: 'remaining', data: { remaining: parseInt(remainingMatch[1]) } }
      }
      return null
    }
  },

  // 4. Universal Fallback Adapter
  {
    name: 'Universal',
    matches: () => true,
    getInputElement: () => {
      return (
        document.querySelector<HTMLElement>('#prompt-textarea') ||
        document.querySelector<HTMLElement>('div[contenteditable="true"]') ||
        document.querySelector<HTMLElement>('textarea') ||
        document.querySelector<HTMLElement>('input[type="text"]')
      )
    },
    getSendButton: () => {
      return (
        document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]') ||
        document.querySelector<HTMLButtonElement>('button[type="submit"]') ||
        document.querySelector<HTMLButtonElement>('button[aria-label*="Send" i]')
      )
    },
    getStopButton: () => {
      return (
        document.querySelector<HTMLElement>('button[data-testid="stop-button"]') ||
        document.querySelector<HTMLElement>('button[aria-label*="Stop" i]')
      )
    },
    getLastResponseText: () => {
      const messages = document.querySelectorAll<HTMLElement>(
        '.model-response-text, .font-claude-message, [data-message-author-role="assistant"], .markdown-body, article'
      )
      if (messages.length === 0) return null
      const last = messages[messages.length - 1]
      return last.innerText?.trim() || last.textContent?.trim() || null
    }
  }
]

// Determine active adapter for current webview page
function getActiveAdapter(): BotAdapter {
  const host = window.location.hostname
  const found = adapters.find((a) => a.matches(host))
  return found || adapters[adapters.length - 1]
}

// Robust text injection strategy inspired by ChatALL
function injectTextIntoElement(target: HTMLElement, text: string): boolean {
  try {
    target.focus()

    // 1. Dispatch beforeinput (critical for ProseMirror / Lexical / React state)
    try {
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      })
      target.dispatchEvent(beforeInputEvent)
    } catch (err) {
      console.warn('[Webview-Preload] beforeinput event failed', err)
    }

    // Case 1: Standard input / textarea
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const proto = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(target, text)
      } else {
        target.value = text
      }
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    // Case 2: Rich text / contenteditable editors (ChatGPT, Claude, Gemini)
    try {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.selectNodeContents(target)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      const success = document.execCommand('insertText', false, text)
      if (success) {
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
        return true
      }
    } catch (err) {
      console.warn('[Webview-Preload] execCommand failed', err)
    }

    // Case 3: Clipboard event emulation
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })
      target.dispatchEvent(pasteEvent)
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      return true
    } catch (err) {
      console.warn('[Webview-Preload] ClipboardEvent paste failed', err)
    }

    // Case 4: textContent direct assign fallback
    target.textContent = text
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch (globalErr: any) {
    console.error('[Webview-Preload] injectTextIntoElement error:', globalErr)
    return false
  }
}

// --- IPC LISTENERS ---

ipcRenderer.on('inject-text', (_event: any, text: string) => {
  try {
    const adapter = getActiveAdapter()
    const input = adapter.getInputElement()
    if (input) {
      const injected = injectTextIntoElement(input, text)
      ipcRenderer.sendToHost('inject-text-result', { success: injected })
    } else {
      ipcRenderer.sendToHost('inject-text-result', {
        success: false,
        error: `Input field not found for ${adapter.name}. Please ensure you are logged into your account in this tab.`,
      })
    }
  } catch (err: any) {
    ipcRenderer.sendToHost('inject-text-result', { success: false, error: err.message })
  }
})

ipcRenderer.on('submit-chat', () => {
  try {
    const adapter = getActiveAdapter()

    const attemptClick = () => {
      const sendBtn = adapter.getSendButton() as HTMLButtonElement | null
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        sendBtn.click()
        return true
      }
      return false
    }

    // Attempt 1: Immediate click if already enabled
    if (attemptClick()) {
      ipcRenderer.sendToHost('submit-chat-result', { success: true })
      return
    }

    // Attempt 2: Wait 250ms for React/Lexical state machine to enable the button
    setTimeout(() => {
      if (attemptClick()) {
        ipcRenderer.sendToHost('submit-chat-result', { success: true })
        return
      }

      // Attempt 3: Fallback simulated Enter key
      const input = adapter.getInputElement()
      if (input) {
        input.focus()
        const enterDown = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        })
        input.dispatchEvent(enterDown)
        ipcRenderer.sendToHost('submit-chat-result', { success: true, fallback: true })
      } else {
        ipcRenderer.sendToHost('submit-chat-result', {
          success: false,
          error: 'Submit button not ready and input not found.',
        })
      }
    }, 250)
  } catch (err: any) {
    ipcRenderer.sendToHost('submit-chat-result', { success: false, error: err.message })
  }
})

ipcRenderer.on('check-status', () => {
  try {
    const adapter = getActiveAdapter()
    const stopBtn = adapter.getStopButton()
    const isGenerating = !!stopBtn
    ipcRenderer.sendToHost('check-status-result', { isGenerating })
  } catch (err: any) {
    ipcRenderer.sendToHost('check-status-result', { isGenerating: false, error: err.message })
  }
})

ipcRenderer.on('start-new-chat', () => {
  try {
    const adapter = getActiveAdapter()
    const newChatBtn = adapter.getNewChatButton ? adapter.getNewChatButton() : null
    if (newChatBtn) {
      newChatBtn.click()
    } else {
      if (window.location.hostname.includes('chatgpt.com')) window.location.href = '/'
      else if (window.location.hostname.includes('gemini.google.com')) window.location.href = '/app'
      else if (window.location.hostname.includes('claude.ai')) window.location.href = '/new'
    }
    setTimeout(() => {
      ipcRenderer.sendToHost('start-new-chat-result', { success: true })
    }, 1500)
  } catch (err: any) {
    ipcRenderer.sendToHost('start-new-chat-result', { success: false, error: err.message })
  }
})

ipcRenderer.on('get-last-message', () => {
  try {
    const adapter = getActiveAdapter()
    const text = adapter.getLastResponseText()
    if (text) {
      ipcRenderer.sendToHost('get-last-message-result', { success: true, text })
    } else {
      ipcRenderer.sendToHost('get-last-message-result', { success: false, error: 'No response message found yet.' })
    }
  } catch (err: any) {
    ipcRenderer.sendToHost('get-last-message-result', { success: false, error: err.message })
  }
})

// User manual Enter / click detection for usage tracking
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true')) {
      ipcRenderer.sendToHost('message-sent')
    }
  }
})

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement | null
  if (!target) return
  const isSendButton =
    target.matches('button[aria-label*="Send" i]') ||
    target.closest('button[aria-label*="Send" i]') ||
    target.matches('button[data-testid="send-button"]') ||
    target.closest('button[data-testid="send-button"]')

  if (isSendButton) {
    ipcRenderer.sendToHost('message-sent')
  }
})

// Scrape quotas and limits based on adapter definitions
const scrapeLimits = () => {
  try {
    const adapter = getActiveAdapter()
    if (!adapter.scrapeQuota) return
    const bodyText = document.body.innerText || ''
    const res = adapter.scrapeQuota(bodyText)
    if (res) {
      if (res.type === 'percentage') {
        ipcRenderer.sendToHost('scraped-percentage', res.data)
      } else if (res.type === 'limit') {
        ipcRenderer.sendToHost('scraped-limit', res.data)
      } else if (res.type === 'remaining') {
        ipcRenderer.sendToHost('scraped-remaining', res.data)
      }
    }
  } catch (err: any) {
    console.log('[Webview-Preload] Error in scrapeLimits:', err.message)
  }
}

// Background sync every 15 seconds
setInterval(scrapeLimits, 15000)

ipcRenderer.on('force-sync', () => {
  scrapeLimits()
})

// Proactive Generation State Watcher using Debounced MutationObserver
let wasGenerating = false
let debounceTimer: any = null

const observer = new MutationObserver(() => {
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    try {
      const adapter = getActiveAdapter()
      const isGenerating = !!adapter.getStopButton()
      if (isGenerating !== wasGenerating) {
        wasGenerating = isGenerating
        ipcRenderer.sendToHost('generation-status', { isGenerating })
      }
    } catch (err) {
      console.warn('[Webview-Preload] MutationObserver error', err)
    }
  }, 250)
})

const startObserver = () => {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver)
} else {
  startObserver()
}

