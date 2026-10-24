import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Settings,
  Sparkles,
  BrainCircuit,
  Plus,
  Minus,
  X,
  Terminal,
  Globe,
  RefreshCw,
  Square,
  Swords,
  Play,
  Square as SquareIcon,
  Radio,
  Copy,
  Check,
  Bot,
  Moon,
  Cpu,
  Award,
  Zap
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

// Electron API and Webview declarations
declare global {
  interface Window {
    electronAPI: {
      getData: () => Promise<any>
      saveData: (data: any) => Promise<boolean>
      runCliCommand: (cmd: string) => Promise<{ success: boolean; stdout: string; stderr: string; error?: string }>
      getCredentials: () => Promise<WebCredentials>
      saveCredentials: (credentials: WebCredentials) => Promise<boolean>
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      getPreloadPath: () => Promise<string>
      getMemoryMetrics: () => Promise<{ totalMB: number; processCount: number; details: any[] }>
      runPromptCli?: (serviceId: string, prompt: string) => Promise<{ success: boolean; text?: string; error?: string }>
    }
  }
  namespace JSX {
    interface IntrinsicElements {
      webview: any
    }
  }
}

type AIService = {
  id: string
  name: string
  category: 'web' | 'cli'
  icon: React.ReactNode
  url?: string
  cliCommand?: string
  limit?: { current: number; max: number; resetTime: string }
}

type WebCredentialId = 'chatgpt-web' | 'gemini-web' | 'claude-web'
type WebCredentials = Record<WebCredentialId, { email: string; password: string }>

const emptyWebCredentials: WebCredentials = {
  'chatgpt-web': { email: '', password: '' },
  'gemini-web': { email: '', password: '' },
  'claude-web': { email: '', password: '' },
}

const credentialServices: { id: WebCredentialId; name: string }[] = [
  { id: 'chatgpt-web', name: 'ChatGPT Web' },
  { id: 'gemini-web', name: 'Gemini Web' },
  { id: 'claude-web', name: 'Claude Web' },
]

const defaultServices: AIService[] = [
  {
    id: 'chatgpt-web',
    name: 'ChatGPT Web',
    category: 'web',
    icon: <MessageSquare size={18} />,
    url: 'https://chatgpt.com',
    limit: { current: 35, max: 40, resetTime: '2h 15m' },
  },
  {
    id: 'gemini-web',
    name: 'Gemini Web',
    category: 'web',
    icon: <Globe size={18} />,
    url: 'https://gemini.google.com',
    limit: { current: 10, max: 50, resetTime: '4h' },
  },
  {
    id: 'claude-web',
    name: 'Claude Web',
    category: 'web',
    icon: <Sparkles size={18} />,
    url: 'https://claude.ai',
    limit: { current: 12, max: 50, resetTime: '4h' },
  },
  {
    id: 'gpt-cli',
    name: 'Codex (CLI/API)',
    category: 'cli',
    icon: <Terminal size={18} />,
    cliCommand: 'echo /status | codex',
    limit: { current: 150, max: 500, resetTime: '1d' },
  },
  {
    id: 'gemini-cli',
    name: 'Gemini (CLI/API)',
    category: 'cli',
    icon: <BrainCircuit size={18} />,
    cliCommand: 'echo /usage | agy',
    limit: { current: 40, max: 1500, resetTime: '1d' },
  },
  {
    id: 'claude-shared',
    name: 'Claude (Shared)',
    category: 'cli',
    icon: <Sparkles size={18} />,
    limit: { current: 12, max: 50, resetTime: '4h' },
  },
]

type DebateMode = 'debate' | 'collaborate' | 'supervisor'

interface TranscriptMessage {
  author: string
  role?: 'proponent' | 'critic' | 'supervisor' | 'system' | 'user'
  text: string
  timestamp: string
}

function App() {
  const [activeService, setActiveService] = useState<string>('debate-arena')
  const [services, setServices] = useState<AIService[]>(defaultServices)
  const [preloadPath, setPreloadPath] = useState<string>('')
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [webCredentials, setWebCredentials] = useState<WebCredentials>(emptyWebCredentials)
  const [credentialsMessage, setCredentialsMessage] = useState('')
  const [credentialsSaving, setCredentialsSaving] = useState(false)

  const openCredentialsEditor = async () => {
    setWebCredentials(emptyWebCredentials)
    setCredentialsMessage('')
    try {
      setWebCredentials(await window.electronAPI.getCredentials())
    } catch {
      setCredentialsMessage('Could not read credentials from secure OS storage.')
    }
    setCredentialsOpen(true)
  }

  const saveWebCredentials = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCredentialsSaving(true)
    setCredentialsMessage('')
    try {
      await window.electronAPI.saveCredentials(webCredentials)
      setCredentialsMessage('Saved encrypted on this device.')
    } catch (error) {
      setCredentialsMessage(error instanceof Error ? error.message : 'Could not save credentials securely.')
    } finally {
      setCredentialsSaving(false)
    }
  }

  const closeCredentialsEditor = () => {
    setCredentialsOpen(false)
    setWebCredentials(emptyWebCredentials)
    setCredentialsMessage('')
  }

  // RAM Optimization: On-demand webview mounting & hibernation
  const [mountedWebviews, setMountedWebviews] = useState<Record<string, boolean>>({
    'chatgpt-web': true, // Mount initially
    'gemini-web': false,
    'claude-web': false,
  })

  // Live System RAM and process tracking
  const [memoryMetrics, setMemoryMetrics] = useState<{ totalMB: number; processCount: number }>({
    totalMB: 0,
    processCount: 0,
  })

  // AutoGen-style Multi-Agent Orchestration State
  const [debateState, setDebateState] = useState({
    isActive: false,
    mode: 'debate' as DebateMode,
    ai1: 'chatgpt-web',
    ai2: 'gemini-web',
    judgeEnabled: true,
    judgeAi: 'gemini-web',
    topic: 'Should AI systems be open source or strictly centralized and regulated?',
    rounds: 2,
    currentRound: 1,
    statusText: '',
    transcript: [] as TranscriptMessage[],
  })
  const debateActiveRef = useRef(false)

  // ChatALL-style Broadcast Hub State (Supports both Web and CLI)
  const [broadcastSelected, setBroadcastSelected] = useState<string[]>([
    'chatgpt-web',
  ])
  const [broadcastPrompt, setBroadcastPrompt] = useState<string>(
    'Explain the AI Supervisor pattern in 3 concise bullet points.'
  )
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [broadcastResults, setBroadcastResults] = useState<
    Record<string, { status: 'idle' | 'sending' | 'generating' | 'completed' | 'error'; text: string }>
  >({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Scoped promise map for webview IPC to avoid concurrency collisions
  const pendingIpcRef = useRef<Record<string, { resolve: Function; reject: Function }>>({})

  // Generation status map tracked via MutationObserver in webview-preload
  const generatingStatusRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    // Load persisted data and preload path
    if (window.electronAPI) {
      if (window.electronAPI.getPreloadPath) {
        window.electronAPI.getPreloadPath().then(setPreloadPath)
      }
      window.electronAPI.getData().then((data) => {
        if (data && data.services) {
          setServices((prev) =>
            prev.map((p) => {
              const saved = data.services.find((s: any) => s.id === p.id)
              if (saved && saved.limit) {
                return { ...p, limit: saved.limit }
              }
              return p
            })
          )
        }
        if (data && data.savedTranscript && data.savedTranscript.length > 0) {
          setDebateState((prev) => ({ ...prev, transcript: data.savedTranscript }))
        }
      })
    }
  }, [])

  // Auto-mount active webview when navigated to
  useEffect(() => {
    if (services.find((s) => s.id === activeService && s.category === 'web')) {
      setMountedWebviews((prev) => ({ ...prev, [activeService]: true }))
    }
  }, [activeService, services])

  // Periodic RAM monitor polling
  useEffect(() => {
    const updateMemory = async () => {
      if (window.electronAPI?.getMemoryMetrics) {
        try {
          const metrics = await window.electronAPI.getMemoryMetrics()
          if (metrics && metrics.totalMB) {
            setMemoryMetrics({ totalMB: metrics.totalMB, processCount: metrics.processCount })
          }
        } catch (_err) {
          // ignore error
        }
      }
    }
    updateMemory()
    const interval = setInterval(updateMemory, 3500)
    return () => clearInterval(interval)
  }, [])

  const activeServiceRef = useRef(activeService)
  useEffect(() => {
    activeServiceRef.current = activeService
  }, [activeService])

  const isTarget = (id: string, activeId: string) => {
    if (id === activeId) return true
    if (id === 'claude-shared' && activeId === 'claude-web') return true
    if (id === 'claude-web' && activeId === 'claude-shared') return true
    return false
  }

  // Hibernate (unmount) inactive webviews to reclaim RAM
  const hibernateWebview = (serviceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setMountedWebviews((prev) => ({ ...prev, [serviceId]: false }))
  }

  const hibernateAllInactive = () => {
    setMountedWebviews(() => {
      const next: Record<string, boolean> = {}
      services.filter((s) => s.category === 'web').forEach((s) => {
        next[s.id] = s.id === activeService
      })
      return next
    })
  }

  useEffect(() => {
    const handleIpcMessage = (event: any) => {
      const currentActive = activeServiceRef.current
      const senderElement = event.target as HTMLElement | null
      const serviceId = senderElement?.id?.replace('webview-', '') || ''

      // Handle scoped promises
      if (event.channel.endsWith('-result')) {
        const key = `${serviceId}:${event.channel}`
        const genericKey = event.channel
        const promise = pendingIpcRef.current[key] || pendingIpcRef.current[genericKey]
        if (promise) {
          promise.resolve(event.args[0])
          delete pendingIpcRef.current[key]
          delete pendingIpcRef.current[genericKey]
        }
      }

      // Proactive generation status from MutationObserver
      if (event.channel === 'generation-status') {
        const { isGenerating } = event.args[0]
        if (serviceId) {
          generatingStatusRef.current[serviceId] = isGenerating
        }
      }

      if (event.channel === 'message-sent') {
        setServices((prev) => {
          const newData = prev.map((s) => {
            if (isTarget(s.id, currentActive) && s.limit) {
              return { ...s, limit: { ...s.limit, current: Math.min(s.limit.current + 1, s.limit.max) } }
            }
            return s
          })
          const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
          if (window.electronAPI) window.electronAPI.saveData({ services: dataToSave })
          return newData
        })
      }

      if (event.channel === 'scraped-remaining') {
        const { remaining } = event.args[0]
        setServices((prev) => {
          const newData = prev.map((s) => {
            if (isTarget(s.id, currentActive) && s.limit) {
              const current = Math.max(0, s.limit.max - remaining)
              return { ...s, limit: { ...s.limit, current } }
            }
            return s
          })
          const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
          if (window.electronAPI) window.electronAPI.saveData({ services: dataToSave })
          return newData
        })
      }

      if (event.channel === 'scraped-limit') {
        const { current, max } = event.args[0]
        setServices((prev) => {
          const newData = prev.map((s) => {
            if (isTarget(s.id, currentActive) && s.limit) {
              return { ...s, limit: { ...s.limit, current, max } }
            }
            return s
          })
          const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
          if (window.electronAPI) window.electronAPI.saveData({ services: dataToSave })
          return newData
        })
      }

      if (event.channel === 'scraped-percentage') {
        const { percentage } = event.args[0]
        setServices((prev) => {
          const newData = prev.map((s) => {
            if (isTarget(s.id, currentActive) && s.limit) {
              const current = Math.round((percentage / 100) * s.limit.max)
              return { ...s, limit: { ...s.limit, current } }
            }
            return s
          })
          const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
          if (window.electronAPI) window.electronAPI.saveData({ services: dataToSave })
          return newData
        })
      }
    }

    const attachListeners = () => {
      services
        .filter((s) => s.category === 'web')
        .forEach((service) => {
          const wv = document.getElementById(`webview-${service.id}`) as any
          if (wv) {
            wv.removeEventListener('ipc-message', handleIpcMessage)
            wv.addEventListener('ipc-message', handleIpcMessage)
          }
        })
    }

    attachListeners()
    const timer = setTimeout(attachListeners, 500)

    return () => {
      clearTimeout(timer)
      services
        .filter((s) => s.category === 'web')
        .forEach((service) => {
          const wv = document.getElementById(`webview-${service.id}`) as any
          if (wv) {
            wv.removeEventListener('ipc-message', handleIpcMessage)
          }
        })
    }
  }, [services.length, mountedWebviews])

  const handleManualAdjust = (e: React.MouseEvent, serviceId: string, amount: number) => {
    e.stopPropagation()
    setServices((prev) => {
      const newData = prev.map((s) => {
        if (isTarget(s.id, serviceId) && s.limit) {
          const newCurrent = Math.max(0, Math.min(s.limit.current + amount, s.limit.max))
          return { ...s, limit: { ...s.limit, current: newCurrent } }
        }
        return s
      })
      if (window.electronAPI) {
        const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
        window.electronAPI.saveData({ services: dataToSave })
      }
      return newData
    })
  }

  const handleCliSync = async (serviceId: string, cmd: string) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.runCliCommand(cmd)
    if (result.success) {
      const matches = result.stdout.match(/(\d+)\s*\/\s*(\d+)/)
      setServices((prev) => {
        const newData = prev.map((s) => {
          if (isTarget(s.id, serviceId) && s.limit) {
            let newCurrent = s.limit.current
            let newMax = s.limit.max
            if (matches && matches.length >= 3) {
              newCurrent = parseInt(matches[1])
              newMax = parseInt(matches[2])
            }
            return { ...s, limit: { ...s.limit, current: newCurrent, max: newMax } }
          }
          return s
        })
        const dataToSave = newData.map((s) => ({ id: s.id, limit: s.limit }))
        window.electronAPI.saveData({ services: dataToSave })
        return newData
      })
    }
  }

  const handleWebSync = (e: React.MouseEvent | null, serviceId: string) => {
    if (e) e.stopPropagation()
    const wv = document.getElementById(`webview-${serviceId}`) as any
    if (wv && typeof wv.send === 'function') {
      wv.send('force-sync')
    }
  }

  const handleSyncAll = async () => {
    const cliSyncPromises = services
      .filter((s) => s.category === 'cli' && s.cliCommand)
      .map((s) => handleCliSync(s.id, s.cliCommand!))

    services
      .filter((s) => s.category === 'web')
      .forEach((s) => {
        handleWebSync(null, s.id)
      })

    await Promise.all(cliSyncPromises)
  }

  // Scoped IPC communication with webviews
  const sendIpcAndWait = (serviceId: string, channel: string, args: any = null): Promise<any> => {
    return new Promise((resolve, reject) => {
      const scopedKey = `${serviceId}:${channel}-result`
      pendingIpcRef.current[scopedKey] = { resolve, reject }

      const wv = document.getElementById(`webview-${serviceId}`) as any
      if (wv && typeof wv.send === 'function') {
        const timeout = setTimeout(() => {
          if (pendingIpcRef.current[scopedKey]) {
            delete pendingIpcRef.current[scopedKey]
            reject(new Error(`Timeout waiting for ${channel} from ${serviceId}`))
          }
        }, 6000)

        const originalResolve = resolve
        pendingIpcRef.current[scopedKey].resolve = (val: any) => {
          clearTimeout(timeout)
          originalResolve(val)
        }

        try {
          wv.send(channel, args)
        } catch (err: any) {
          clearTimeout(timeout)
          delete pendingIpcRef.current[scopedKey]
          reject(err)
        }
      } else {
        delete pendingIpcRef.current[scopedKey]
        reject(new Error(`Webview for ${serviceId} not mounted or not ready.`))
      }
    })
  }

  // Helper to ensure webview is mounted before interacting
  const ensureWebviewMounted = async (serviceId: string) => {
    if (!mountedWebviews[serviceId]) {
      setMountedWebviews((prev) => ({ ...prev, [serviceId]: true }))
      // Allow brief delay for DOM mount & preload attachment
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  // --- AUTOGEN-STYLE PROMPT BUILDER ---
  const buildAgentPrompt = (
    mode: DebateMode,
    topic: string,
    role: 'proponent' | 'critic' | 'supervisor',
    contenderName: string,
    opponentText: string | null,
    round: number,
    totalRounds: number
  ): string => {
    if (round === 1 && !opponentText) {
      if (mode === 'debate') {
        return `[Round 1/${totalRounds}] TOPIC: "${topic}"\nROLE: You are the Affirmative/Proponent.\nINSTRUCTIONS: Present a sharp, logically sound opening argument defending this stance. Be concise, well-structured, and persuasive.`
      } else if (mode === 'collaborate') {
        return `[Round 1/${totalRounds}] TASK: "${topic}"\nROLE: System Architect.\nINSTRUCTIONS: Propose an initial technical blueprint and solution architecture for this task. Outline the key design choices and trade-offs.`
      } else {
        return `[Round 1/${totalRounds}] TOPIC: "${topic}"\nROLE: Primary Analyst.\nINSTRUCTIONS: Provide a foundational overview and initial thesis on this subject.`
      }
    }

    if (role === 'critic') {
      if (mode === 'debate') {
        return `[Round ${round}/${totalRounds}] TOPIC: "${topic}"\nROLE: Counter-Debater / Skeptic.\nARGUMENT FROM ${contenderName.toUpperCase()}:\n"${opponentText}"\n\nINSTRUCTIONS: Formulate a direct rebuttal. Dissect any logical leaps, unproven assumptions, or practical blindspots in their argument. Keep it concise and rigorous.`
      } else if (mode === 'collaborate') {
        return `[Round ${round}/${totalRounds}] TASK: "${topic}"\nROLE: Principal Code & Security Reviewer.\nPROPOSAL FROM ${contenderName.toUpperCase()}:\n"${opponentText}"\n\nINSTRUCTIONS: Perform an adversarial code and architecture review. Point out edge cases, scalability limits, security concerns, or simpler alternatives.`
      }
    }

    // Refinement / Follow-up turn
    return `[Round ${round}/${totalRounds}] TOPIC: "${topic}"\nROLE: Rebuttal & Synthesis.\nCRITIQUE FROM ${contenderName.toUpperCase()}:\n"${opponentText}"\n\nINSTRUCTIONS: Address the critique raised above. Refine your proposal, concede valid criticisms, and present your synthesis. If both sides have arrived at an agreeable consensus, include "[CONSENSUS_REACHED]" at the end.`
  }

  // --- AUTOGEN MULTI-AGENT DEBATE RUNNER ---
  const runDebate = async () => {
    setDebateState((prev) => ({
      ...prev,
      isActive: true,
      currentRound: 1,
      statusText: 'Waking participating models...',
      transcript: [
        {
          author: 'User',
          role: 'user',
          text: `[Topic]: ${prev.topic}\n[Mode]: ${prev.mode.toUpperCase()} (${prev.rounds} Rounds)`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    }))
    debateActiveRef.current = true

    // 1. Ensure participating webviews are mounted
    await ensureWebviewMounted(debateState.ai1)
    await ensureWebviewMounted(debateState.ai2)
    if (debateState.judgeEnabled && debateState.judgeAi) {
      await ensureWebviewMounted(debateState.judgeAi)
    }

    // 2. Prepare clean chat sessions
    for (const ai of [debateState.ai1, debateState.ai2]) {
      try {
        const aiData = services.find((s) => s.id === ai)
        const aiName = aiData?.name || ai
        setDebateState((prev) => ({
          ...prev,
          statusText: `Preparing clean session for ${aiName}...`,
        }))

        const wv = document.getElementById(`webview-${ai}`) as any
        if (wv && aiData?.url) {
          wv.loadURL(aiData.url)
          await new Promise<void>((resolve) => {
            const handler = () => {
              wv.removeEventListener('did-finish-load', handler)
              setTimeout(resolve, 2000)
            }
            wv.addEventListener('did-finish-load', handler)
            setTimeout(() => {
              wv.removeEventListener('did-finish-load', handler)
              resolve()
            }, 6000)
          })
        }
      } catch (e) {
        console.error(e)
      }
    }

    let lastResponseText: string | null = null
    let lastAuthorName = 'Initiator'

    for (let r = 1; r <= debateState.rounds; r++) {
      if (!debateActiveRef.current) break
      setDebateState((prev) => ({ ...prev, currentRound: r }))

      // Alternating turns: AI 1 (Proponent) then AI 2 (Critic)
      const participants = [
        { id: debateState.ai1, role: 'proponent' as const },
        { id: debateState.ai2, role: 'critic' as const },
      ]

      for (const { id: aiId, role } of participants) {
        if (!debateActiveRef.current) break

        const aiData = services.find((s) => s.id === aiId)
        const aiName = aiData?.name || aiId

        const promptText = buildAgentPrompt(
          debateState.mode,
          debateState.topic,
          role,
          lastAuthorName,
          lastResponseText,
          r,
          debateState.rounds
        )

        setDebateState((prev) => ({
          ...prev,
          statusText: `${aiName} (${role.toUpperCase()}) is formulating response...`,
        }))

        try {
          // Inject prompt
          await sendIpcAndWait(aiId, 'inject-text', promptText)
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Submit prompt
          await sendIpcAndWait(aiId, 'submit-chat')

          // Wait for generation
          let isDone = false
          let checkCount = 0
          while (!isDone && debateActiveRef.current && checkCount < 35) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            const status = await sendIpcAndWait(aiId, 'check-status')
            if (!status.isGenerating && checkCount > 1) {
              isDone = true
            }
            checkCount++
          }

          if (!debateActiveRef.current) break

          await new Promise((resolve) => setTimeout(resolve, 1200))
          const res = await sendIpcAndWait(aiId, 'get-last-message')

          if (res.success && res.text) {
            lastResponseText = res.text
            lastAuthorName = aiName

            const newMsg: TranscriptMessage = {
              author: aiName,
              role,
              text: res.text,
              timestamp: new Date().toLocaleTimeString(),
            }

            setDebateState((prev) => {
              const updated = prev.transcript.filter((t) => t.role !== 'system').concat([newMsg])
              if (window.electronAPI) window.electronAPI.saveData({ savedTranscript: updated })
              return { ...prev, transcript: updated }
            })

            // Consensus termination check
            if (res.text.includes('[CONSENSUS_REACHED]') || res.text.includes('TERMINATE')) {
              setDebateState((prev) => ({
                ...prev,
                statusText: 'Consensus reached! Concluding debate.',
                transcript: [
                  ...prev.transcript,
                  {
                    author: 'Supervisor',
                    role: 'supervisor',
                    text: 'Consensus reached between contenders. Concluding dialogue early.',
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ],
              }))
              debateActiveRef.current = false
              break
            }
          } else {
            setDebateState((prev) => ({
              ...prev,
              transcript: [
                ...prev.transcript,
                {
                  author: 'System',
                  role: 'system',
                  text: `Warning: ${aiName} returned an empty response.`,
                  timestamp: new Date().toLocaleTimeString(),
                },
              ],
            }))
            break
          }
        } catch (e: any) {
          console.error(e)
          setDebateState((prev) => ({
            ...prev,
            transcript: [
              ...prev.transcript,
              {
                author: 'System',
                role: 'system',
                text: `Automation Error with ${aiName}: ${e.message}`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          }))
          break
        }
      }
    }

    // Optional 3rd Phase: Supervisor Judge Evaluation
    if (debateActiveRef.current && debateState.judgeEnabled && lastResponseText) {
      setDebateState((prev) => ({ ...prev, statusText: 'Supervisor Judge is evaluating debate...' }))
      const judgeId = debateState.judgeAi || debateState.ai1
      const judgeName = services.find((s) => s.id === judgeId)?.name || 'Supervisor'

      const judgePrompt = `[SUPERVISOR EVALUATION PHASE]\nYou are the Head Supervisor and Debate Judge. Review the discussion above on "${debateState.topic}".\n\nDeliver a formal evaluation:\n1. Comparative Analysis: Evaluate the logical coherence, factual grounding, and rhetoric of each contender.\n2. Key Concessions: Identify blindspots or valid points made by each side.\n3. Final Verdict: State the stronger argument and assign a score (e.g. 8.5/10 vs 7.5/10) with key takeaways.`

      try {
        await sendIpcAndWait(judgeId, 'inject-text', judgePrompt)
        await new Promise((resolve) => setTimeout(resolve, 600))
        await sendIpcAndWait(judgeId, 'submit-chat')

        let isDone = false
        let checkCount = 0
        while (!isDone && checkCount < 35) {
          await new Promise((resolve) => setTimeout(resolve, 1500))
          const status = await sendIpcAndWait(judgeId, 'check-status')
          if (!status.isGenerating && checkCount > 1) isDone = true
          checkCount++
        }

        const judgeRes = await sendIpcAndWait(judgeId, 'get-last-message')
        if (judgeRes.success && judgeRes.text) {
          const verdictMsg: TranscriptMessage = {
            author: `${judgeName} (Supervisor Judge)`,
            role: 'supervisor',
            text: judgeRes.text,
            timestamp: new Date().toLocaleTimeString(),
          }
          setDebateState((prev) => {
            const updated = [...prev.transcript, verdictMsg]
            if (window.electronAPI) window.electronAPI.saveData({ savedTranscript: updated })
            return { ...prev, transcript: updated }
          })
        }
      } catch (e: any) {
        console.warn('Judge evaluation failed:', e)
      }
    }

    setDebateState((prev) => ({ ...prev, isActive: false, statusText: 'Debate finished.' }))
    debateActiveRef.current = false
  }

  const stopDebate = () => {
    debateActiveRef.current = false
    setDebateState((prev) => ({
      ...prev,
      isActive: false,
      statusText: 'Debate stopped by user.',
      transcript: [
        ...prev.transcript,
        {
          author: 'System',
          role: 'system',
          text: 'Debate interrupted by user.',
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    }))
  }

  // --- CHATALL-STYLE BROADCAST RUNNER (Web + CLI) ---
  const broadcastAbortRef = useRef(false)

  const stopBroadcast = () => {
    broadcastAbortRef.current = true
    setIsBroadcasting(false)
    setBroadcastResults((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach((id) => {
        if (updated[id].status === 'generating' || updated[id].status === 'sending') {
          updated[id] = { status: 'error', text: 'Broadcast stopped by user.' }
        }
      })
      return updated
    })
  }

  const runBroadcast = async () => {
    if (!broadcastPrompt.trim() || broadcastSelected.length === 0) return
    setIsBroadcasting(true)
    broadcastAbortRef.current = false

    try {
      // 1. Ensure any selected webviews are mounted
      for (const serviceId of broadcastSelected) {
        if (services.find((s) => s.id === serviceId && s.category === 'web')) {
          if (!mountedWebviews[serviceId]) {
            setMountedWebviews((prev) => ({ ...prev, [serviceId]: true }))
          }
        }
      }

      // Initial state
      const initialMap: Record<string, { status: 'sending' | 'generating' | 'completed' | 'error'; text: string }> = {}
      broadcastSelected.forEach((id) => {
        initialMap[id] = { status: 'sending', text: 'Connecting...' }
      })
      setBroadcastResults(initialMap)

      // Allow brief moment for webview mounting if newly added
      await new Promise((r) => setTimeout(r, 600))

      // Dispatch concurrently to all selected services (Web + CLI)
      await Promise.all(
        broadcastSelected.map(async (serviceId) => {
          if (broadcastAbortRef.current) return
          const svc = services.find((s) => s.id === serviceId)

          // Branch A: Local CLI Model execution
          if (svc?.category === 'cli') {
            if (serviceId === 'claude-shared') {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: {
                  status: 'error',
                  text: 'Claude (Shared) is a quota tracker. Select Claude Web for broadcast queries.',
                },
              }))
              return
            }

            try {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: { status: 'generating', text: `Executing ${svc.name} query...` },
              }))

              if (window.electronAPI?.runPromptCli) {
                const res = await window.electronAPI.runPromptCli(serviceId, broadcastPrompt)
                if (broadcastAbortRef.current) return
                if (res && res.success) {
                  setBroadcastResults((prev) => ({
                    ...prev,
                    [serviceId]: { status: 'completed', text: res.text || '(Completed)' },
                  }))
                } else {
                  setBroadcastResults((prev) => ({
                    ...prev,
                    [serviceId]: { status: 'error', text: res?.error || 'CLI process execution failed.' },
                  }))
                }
              } else {
                setBroadcastResults((prev) => ({
                  ...prev,
                  [serviceId]: { status: 'error', text: 'CLI prompt API not available.' },
                }))
              }
            } catch (err: any) {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: { status: 'error', text: err.message || 'CLI execution error.' },
              }))
            }
            return
          }

          // Branch B: Webview Model execution
          try {
            const wv = document.getElementById(`webview-${serviceId}`) as any
            if (!wv) {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: {
                  status: 'error',
                  text: `Webview for ${svc?.name || serviceId} is not ready yet. Click the tab on the left to initialize.`,
                },
              }))
              return
            }

            setBroadcastResults((prev) => ({
              ...prev,
              [serviceId]: { status: 'generating', text: 'Injecting prompt into chat session...' },
            }))

            // 1. Inject prompt
            const injectRes = await sendIpcAndWait(serviceId, 'inject-text', broadcastPrompt)
            if (broadcastAbortRef.current) return

            if (!injectRes || !injectRes.success) {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: {
                  status: 'error',
                  text:
                    injectRes?.error ||
                    `Chat input field not found. Ensure you are logged into ${svc?.name} in its tab.`,
                },
              }))
              return
            }

            await new Promise((r) => setTimeout(r, 400))
            if (broadcastAbortRef.current) return

            // 2. Submit chat
            await sendIpcAndWait(serviceId, 'submit-chat')

            // 3. Wait for generation completion (up to 25s)
            let isDone = false
            let attempts = 0
            while (!isDone && attempts < 25 && !broadcastAbortRef.current) {
              await new Promise((r) => setTimeout(r, 1200))
              try {
                const status = await sendIpcAndWait(serviceId, 'check-status')
                if (!status.isGenerating && attempts > 1) {
                  isDone = true
                }
              } catch (_e) {
                if (attempts > 3) isDone = true
              }
              attempts++
            }

            if (broadcastAbortRef.current) return

            // 4. Retrieve result
            await new Promise((r) => setTimeout(r, 800))
            const res = await sendIpcAndWait(serviceId, 'get-last-message')

            if (res && res.success && res.text) {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: { status: 'completed', text: res.text },
              }))
            } else {
              setBroadcastResults((prev) => ({
                ...prev,
                [serviceId]: {
                  status: 'error',
                  text: res?.error || 'Prompt sent, but no response was captured yet. Check the webview tab.',
                },
              }))
            }
          } catch (e: any) {
            setBroadcastResults((prev) => ({
              ...prev,
              [serviceId]: {
                status: 'error',
                text: e.message || 'Error communicating with webview.',
              },
            }))
          }
        })
      )
    } catch (globalErr: any) {
      console.error('Broadcast execution error:', globalErr)
    } finally {
      setIsBroadcasting(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const exportDebateMarkdown = () => {
    const md = [
      `# Unified Supervisor - Multi-Agent Debate Transcript`,
      `**Topic:** ${debateState.topic}`,
      `**Mode:** ${debateState.mode.toUpperCase()}`,
      `**Contenders:** ${services.find((s) => s.id === debateState.ai1)?.name} vs ${services.find((s) => s.id === debateState.ai2)?.name}`,
      `**Date:** ${new Date().toLocaleString()}`,
      ``,
      `---`,
      ``,
      ...debateState.transcript.map((msg) => {
        return `### ${msg.author} ${msg.role ? `[${msg.role.toUpperCase()}]` : ''} - *${msg.timestamp}*\n\n${msg.text}\n`
      }),
    ].join('\n')

    copyToClipboard(md, 'full-transcript')
  }

  const activeServiceData = services.find((s) => s.id === activeService)
  const webServices = services.filter((s) => s.category === 'web')
  const cliServices = services.filter((s) => s.category === 'cli')

  const mountedWebviewCount = Object.values(mountedWebviews).filter(Boolean).length

  const renderServiceList = (list: AIService[]) => (
    <div className="service-group-list">
      {list.map((service) => {
        const isMounted = mountedWebviews[service.id]

        return (
          <motion.div
            key={service.id}
            className={`service-item interactive ${activeService === service.id ? 'active' : ''}`}
            onClick={() => setActiveService(service.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="service-icon">{service.icon}</div>
            <div className="service-info">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="service-name">{service.name}</span>
                {service.category === 'web' && !isMounted && (
                  <span className="hibernated-badge" title="Webview hibernated to save ~400MB RAM">
                    Sleeping
                  </span>
                )}
              </div>
              {service.limit && (
                <div className="limit-bar-container">
                  <div className="limit-bar-bg">
                    <div
                      className="limit-bar"
                      style={{
                        width: `${(service.limit.current / service.limit.max) * 100}%`,
                        backgroundColor:
                          service.limit.current / service.limit.max > 0.8 ? '#ff4d4d' : 'var(--accent-primary)',
                      }}
                    />
                  </div>
                  <div className="limit-text-row">
                    <span className="limit-text">
                      {['gemini-web', 'claude-web', 'claude-shared'].includes(service.id)
                        ? `${Math.round((service.limit.current / service.limit.max) * 100)}% used`
                        : `${service.limit.max - service.limit.current} left`}
                    </span>
                    <div className="limit-controls">
                      {service.category === 'web' && isMounted && (
                        <button
                          className="adjust-btn interactive"
                          onClick={(e) => hibernateWebview(service.id, e)}
                          title="Hibernate to reclaim RAM"
                        >
                          <Moon size={11} />
                        </button>
                      )}
                      {service.category === 'web' && activeService === service.id && isMounted && (
                        <>
                          <button
                            className="adjust-btn interactive"
                            onClick={(e) => handleWebSync(e, service.id)}
                            title="Force Web Sync"
                          >
                            <RefreshCw size={12} />
                          </button>
                          <button
                            className="adjust-btn interactive"
                            onClick={(e) => {
                              e.stopPropagation()
                              ;(document.getElementById(`webview-${service.id}`) as any)?.reload()
                            }}
                            title="Reload Webview"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </>
                      )}
                      <button
                        className="adjust-btn interactive"
                        onClick={(e) => handleManualAdjust(e, service.id, -1)}
                        title="Decrement usage"
                      >
                        <Minus size={12} />
                      </button>
                      <button
                        className="adjust-btn interactive"
                        onClick={(e) => handleManualAdjust(e, service.id, 1)}
                        title="Increment usage"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )

  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = () => window.electronAPI?.maximizeWindow()
  const handleClose = () => window.electronAPI?.closeWindow()

  return (
    <>
      <div className="titlebar">
        <div className="titlebar-drag-area">Unified Supervisor</div>
        <div className="window-controls">
          <button className="window-control-btn" onClick={handleMinimize} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="window-control-btn" onClick={handleMaximize} title="Maximize">
            <Square size={12} />
          </button>
          <button className="window-control-btn close" onClick={handleClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="app-container">
        {/* Sidebar */}
        <div className="sidebar glass-panel">
          <div className="sidebar-header">
            <h2>AI Supervisor</h2>
          </div>

          <div className="sidebar-scroll-area">
            {/* Orchestration Tools */}
            <div className="service-group">
              <div className="service-group-title">Orchestration Tools</div>
              <div className="service-group-list">
                <motion.div
                  className={`service-item interactive ${activeService === 'debate-arena' ? 'active' : ''}`}
                  onClick={() => setActiveService('debate-arena')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="service-icon">
                    <Swords size={18} />
                  </div>
                  <div className="service-info">
                    <span className="service-name">Debate Arena (AutoGen)</span>
                  </div>
                </motion.div>

                <motion.div
                  className={`service-item interactive ${activeService === 'broadcast-hub' ? 'active' : ''}`}
                  onClick={() => setActiveService('broadcast-hub')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="service-icon">
                    <Radio size={18} />
                  </div>
                  <div className="service-info">
                    <span className="service-name">Broadcast Hub (ChatALL)</span>
                  </div>
                </motion.div>
              </div>
            </div>

            <div className="service-group">
              <div className="service-group-title">Web Chatbots</div>
              {renderServiceList(webServices)}
            </div>

            <div className="service-group">
              <div className="service-group-title">Local CLI</div>
              {renderServiceList(cliServices)}
            </div>
          </div>

          <div className="sidebar-footer">
            {/* Live RAM & Memory Management Widget */}
            <div className="ram-monitor-container">
              <div className="ram-monitor-header">
                <span className="ram-label">
                  <Cpu size={12} />
                  <span>Memory</span>
                </span>
                <span
                  className={`ram-value ${
                    memoryMetrics.totalMB < 500 ? 'optimal' : memoryMetrics.totalMB < 900 ? 'moderate' : 'high'
                  }`}
                >
                  {memoryMetrics.totalMB ? `${memoryMetrics.totalMB} MB` : 'Monitoring...'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>Active Tabs: {mountedWebviewCount}</span>
                {mountedWebviewCount > 1 && (
                  <button
                    className="hibernate-action-btn"
                    onClick={hibernateAllInactive}
                    title="Sleep background tabs to reclaim 400MB+ RAM"
                  >
                    <Moon size={10} /> Hibernate Inactive
                  </button>
                )}
              </div>
            </div>

            <div className="footer-btn-row">
              <button
                className="settings-btn interactive"
                onClick={handleSyncAll}
                style={{ width: '40px', padding: 0, justifyContent: 'center' }}
                title="Sync All Limits"
              >
                <RefreshCw size={18} />
              </button>
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button className="settings-btn interactive" style={{ flex: 1 }}>
                    <Settings size={18} />
                    <span>Settings</span>
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content">
                    <Dialog.Title className="dialog-title">Settings & Memory Management</Dialog.Title>
                    <Dialog.Description className="dialog-description">
                      Manage subscriptions, rate limits, and memory optimization settings.
                    </Dialog.Description>
                    <div className="settings-fields">
                      {services.map((service) => (
                        <div key={service.id} className="settings-row">
                          <span className="settings-label">{service.name}</span>
                          {service.limit ? (
                            <div className="settings-value">Limit: {service.limit.max}</div>
                          ) : (
                            <div className="settings-value">No tracking</div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                      <button
                        className="primary-btn interactive"
                        onClick={openCredentialsEditor}
                        style={{ fontSize: '0.85rem' }}
                      >
                        Manage Web Credentials
                      </button>
                      <button
                        className="secondary-btn interactive"
                        onClick={hibernateAllInactive}
                        style={{ fontSize: '0.85rem' }}
                      >
                        Hibernate Inactive Tabs
                      </button>
                    </div>

                    <div className="dialog-close-wrapper">
                      <Dialog.Close asChild>
                        <button className="dialog-close-btn" aria-label="Close">
                          <X size={16} />
                        </button>
                      </Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              <Dialog.Root
                open={credentialsOpen}
                onOpenChange={(open) => {
                  if (open) setCredentialsOpen(true)
                  else closeCredentialsEditor()
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content credential-dialog-content">
                    <Dialog.Title className="dialog-title">Web Credentials</Dialog.Title>
                    <Dialog.Description className="dialog-description">
                      Credentials are encrypted with this device's secure OS storage and kept outside the project folder.
                    </Dialog.Description>
                    <form className="credential-form" onSubmit={saveWebCredentials}>
                      {credentialServices.map(({ id, name }) => (
                        <section className="credential-service" key={id}>
                          <h3>{name}</h3>
                          <div className="credential-fields">
                            <label>
                              Email
                              <input
                                type="email"
                                autoComplete="username"
                                value={webCredentials[id].email}
                                onChange={(event) => setWebCredentials((current) => ({
                                  ...current,
                                  [id]: { ...current[id], email: event.target.value },
                                }))}
                              />
                            </label>
                            <label>
                              Password
                              <input
                                type="password"
                                autoComplete="current-password"
                                value={webCredentials[id].password}
                                onChange={(event) => setWebCredentials((current) => ({
                                  ...current,
                                  [id]: { ...current[id], password: event.target.value },
                                }))}
                              />
                            </label>
                          </div>
                        </section>
                      ))}
                      <p className="credential-status" aria-live="polite">{credentialsMessage}</p>
                      <div className="credential-actions">
                        <button type="button" className="secondary-btn interactive" onClick={closeCredentialsEditor}>
                          Cancel
                        </button>
                        <button type="submit" className="primary-btn interactive" disabled={credentialsSaving}>
                          {credentialsSaving ? 'Saving...' : 'Save Securely'}
                        </button>
                      </div>
                    </form>
                    <div className="dialog-close-wrapper">
                      <Dialog.Close asChild>
                        <button className="dialog-close-btn" aria-label="Close">
                          <X size={16} />
                        </button>
                      </Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="main-content">
          {/* Webviews: Mounted on-demand to drastically reduce Chromium RAM usage */}
          {webServices.map((service) => {
            const isMounted = mountedWebviews[service.id]

            if (!isMounted && activeService === service.id) {
              return (
                <div key={service.id} className="hibernated-screen">
                  <Moon size={48} style={{ color: 'var(--accent-primary)', opacity: 0.8 }} />
                  <h3>{service.name} is in Hibernation</h3>
                  <p>
                    This tab is sleeping to save ~400 MB of system RAM. Your login session is safely preserved on disk.
                  </p>
                  <button
                    className="primary-btn interactive"
                    onClick={() => ensureWebviewMounted(service.id)}
                  >
                    <Zap size={16} /> Wake Up {service.name}
                  </button>
                </div>
              )
            }

            const isCurrentActive = activeService === service.id
            return (
              <div
                key={service.id}
                className={`webview-container ${isCurrentActive && isMounted ? 'active' : 'background-active'}`}
                style={{
                  display: isMounted ? 'block' : 'none',
                }}
              >
                {preloadPath && isMounted && (
                  <webview
                    id={`webview-${service.id}`}
                    src={service.url}
                    className="webview-element"
                    allowpopups={true as any}
                    partition="persist:unified-supervisor"
                    preload={preloadPath}
                  />
                )}
              </div>
            )
          })}

          <AnimatePresence mode="wait">
            {/* CLI Placeholder */}
            {activeServiceData?.category === 'cli' && (
              <motion.div
                key={activeService}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="cli-placeholder"
              >
                <div className="cli-placeholder-content">
                  <Terminal size={48} className="cli-icon" />
                  <h2>{activeServiceData?.name}</h2>
                  <p>Local CLI / API backend. Zero DOM overhead; executes via lightweight subprocess pipes.</p>

                  {activeServiceData?.limit && (
                    <div className="cli-large-tracker">
                      <div className="cli-large-text">
                        {['claude-shared'].includes(activeServiceData.id) ? (
                          <>
                            <span className="cli-remaining">
                              {Math.round((activeServiceData.limit.current / activeServiceData.limit.max) * 100)}%
                            </span>
                            <span className="cli-max">used</span>
                          </>
                        ) : (
                          <>
                            <span className="cli-remaining">
                              {activeServiceData.limit.max - activeServiceData.limit.current}
                            </span>
                            <span className="cli-max">/ {activeServiceData.limit.max} calls remaining</span>
                          </>
                        )}
                      </div>
                      <div className="cli-progress-bar">
                        <div
                          className="cli-progress-fill"
                          style={{
                            width: `${(activeServiceData.limit.current / activeServiceData.limit.max) * 100}%`,
                          }}
                        />
                      </div>
                      {activeServiceData.cliCommand && (
                        <button
                          className="cli-sync-btn interactive"
                          onClick={() => handleCliSync(activeServiceData.id, activeServiceData.cliCommand!)}
                        >
                          Sync Status with System
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* AutoGen-Style Multi-Agent Debate Arena */}
            {activeService === 'debate-arena' && (
              <motion.div
                key="debate-arena"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="cli-placeholder"
                style={{ alignItems: 'stretch', padding: '2rem' }}
              >
                <div className="debate-header">
                  <h2>
                    <Swords size={28} /> Multi-Agent Supervisor Arena (AutoGen Pattern)
                  </h2>
                  <p>
                    Autonomous round-based dialogue with AutoGen role conditioning, consensus triggers, and an automated
                    Supervisor Judge phase.
                  </p>
                </div>

                <div className="debate-controls glass-panel">
                  <div className="debate-row">
                    <div className="debate-col">
                      <label>Interaction Mode</label>
                      <select
                        value={debateState.mode}
                        onChange={(e) => setDebateState((p) => ({ ...p, mode: e.target.value as DebateMode }))}
                        disabled={debateState.isActive}
                      >
                        <option value="debate">Adversarial Debate (Proponent vs Critic)</option>
                        <option value="collaborate">Collaborative Engineering (Architect vs Reviewer)</option>
                        <option value="supervisor">Synthesizer & Moderator (Supervisor Analysis)</option>
                      </select>
                    </div>

                    <div className="debate-col">
                      <label>AI Contender 1 (Lead)</label>
                      <select
                        value={debateState.ai1}
                        onChange={(e) => setDebateState((p) => ({ ...p, ai1: e.target.value }))}
                        disabled={debateState.isActive}
                      >
                        {webServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="debate-col">
                      <label>AI Contender 2 (Counter)</label>
                      <select
                        value={debateState.ai2}
                        onChange={(e) => setDebateState((p) => ({ ...p, ai2: e.target.value }))}
                        disabled={debateState.isActive}
                      >
                        {webServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="debate-col" style={{ flex: 0.4 }}>
                      <label>Rounds</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={debateState.rounds}
                        onChange={(e) => setDebateState((p) => ({ ...p, rounds: parseInt(e.target.value) || 1 }))}
                        disabled={debateState.isActive}
                      />
                    </div>
                  </div>

                  <div className="debate-row" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="judgeToggle"
                        checked={debateState.judgeEnabled}
                        onChange={(e) => setDebateState((p) => ({ ...p, judgeEnabled: e.target.checked }))}
                        disabled={debateState.isActive}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <label htmlFor="judgeToggle" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                        Include Final Supervisor Judge & Verdict Phase
                      </label>
                    </div>

                    {debateState.judgeEnabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Judge Persona:</span>
                        <select
                          value={debateState.judgeAi}
                          onChange={(e) => setDebateState((p) => ({ ...p, judgeAi: e.target.value }))}
                          disabled={debateState.isActive}
                          style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
                        >
                          {webServices.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="debate-col" style={{ marginTop: '0.75rem' }}>
                    <label>Debate Topic / Problem Statement</label>
                    <textarea
                      value={debateState.topic}
                      onChange={(e) => setDebateState((p) => ({ ...p, topic: e.target.value }))}
                      disabled={debateState.isActive}
                      rows={2}
                      placeholder="e.g. Should artificial intelligence models be fully open-source or strictly regulated?"
                    />
                  </div>

                  <div className="debate-actions">
                    {!debateState.isActive ? (
                      <button className="primary-btn interactive" onClick={runDebate}>
                        <Play size={16} /> Start Multi-Agent Dialogue
                      </button>
                    ) : (
                      <button className="danger-btn interactive" onClick={stopDebate}>
                        <SquareIcon size={16} /> Stop Orchestration
                      </button>
                    )}

                    <button
                      className="secondary-btn interactive"
                      onClick={() => {
                        setDebateState((p) => ({ ...p, transcript: [] }))
                        if (window.electronAPI) window.electronAPI.saveData({ savedTranscript: [] })
                      }}
                      disabled={debateState.isActive || debateState.transcript.length === 0}
                    >
                      Clear
                    </button>

                    <button
                      className="secondary-btn interactive"
                      onClick={exportDebateMarkdown}
                      disabled={debateState.transcript.length === 0}
                      title="Copy full transcript as Markdown"
                    >
                      {copiedId === 'full-transcript' ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copiedId === 'full-transcript' ? 'Copied MD!' : 'Export Markdown'}</span>
                    </button>

                    {debateState.statusText && (
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="status-pill generating">{debateState.statusText}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="debate-transcript glass-panel">
                  {debateState.transcript.length === 0 ? (
                    <div className="transcript-empty">
                      No active transcript. Configure participants and launch the AutoGen debate above.
                    </div>
                  ) : (
                    debateState.transcript.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`transcript-msg ${
                          msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'ai'
                        }`}
                        style={{
                          borderLeft: msg.role === 'supervisor' ? '3px solid #f1c40f' : undefined,
                          background:
                            msg.role === 'supervisor' ? 'rgba(241, 196, 15, 0.08)' : undefined,
                        }}
                      >
                        <div className="transcript-header-row">
                          <div className="transcript-author">
                            {msg.role === 'supervisor' ? <Award size={15} style={{ color: '#f1c40f' }} /> : <Bot size={14} />}
                            <span>{msg.author}</span>
                            {msg.role && msg.role !== 'system' && msg.role !== 'user' && (
                              <span className={`role-badge ${msg.role}`}>{msg.role.toUpperCase()}</span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{msg.timestamp}</span>
                        </div>
                        <div className="transcript-text">{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* ChatALL-Style 1-to-Many Broadcast Hub (Web + CLI) */}
            {activeService === 'broadcast-hub' && (
              <motion.div
                key="broadcast-hub"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="broadcast-container"
              >
                <div className="broadcast-header">
                  <h2>
                    <Radio size={28} /> Broadcast Hub (ChatALL Pattern)
                  </h2>
                  <p>
                    Dispatch a single query concurrently across both <strong>Web Chatbots</strong> and <strong>Local CLIs</strong>,
                    comparing responses side-by-side.
                  </p>
                </div>

                <div className="broadcast-config-card glass-panel">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Select Target AI Models (Web & CLI)
                    </label>
                    <div className="service-selector-row">
                      {services.map((svc) => {
                        const isSelected = broadcastSelected.includes(svc.id)
                        return (
                          <button
                            key={svc.id}
                            className={`service-toggle-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setBroadcastSelected((p) => p.filter((id) => id !== svc.id))
                              } else {
                                setBroadcastSelected((p) => [...p, svc.id])
                              }
                            }}
                          >
                            {svc.icon}
                            <span>{svc.name}</span>
                            {isSelected && <Check size={14} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Prompt to Broadcast
                    </label>
                    <textarea
                      className="broadcast-input-box"
                      value={broadcastPrompt}
                      onChange={(e) => setBroadcastPrompt(e.target.value)}
                      placeholder="Type a query to broadcast across all selected models..."
                      rows={3}
                      disabled={isBroadcasting}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {!isBroadcasting ? (
                      <button
                        className="primary-btn interactive"
                        onClick={runBroadcast}
                        disabled={broadcastSelected.length === 0 || !broadcastPrompt.trim()}
                      >
                        <Play size={16} /> Broadcast to {broadcastSelected.length} Models
                      </button>
                    ) : (
                      <button
                        className="danger-btn interactive"
                        onClick={stopBroadcast}
                      >
                        <SquareIcon size={16} /> Cancel Broadcast
                      </button>
                    )}
                    {isBroadcasting && (
                      <span className="status-pill generating">
                        <RefreshCw size={12} className="spin" /> Broadcasting concurrently...
                      </span>
                    )}
                  </div>
                </div>

                {/* Side-by-side Response Comparison Grid */}
                <div className="broadcast-results-grid">
                  {broadcastSelected.map((serviceId) => {
                    const svc = services.find((s) => s.id === serviceId)
                    const res = broadcastResults[serviceId] || { status: 'idle', text: 'Waiting for prompt dispatch...' }

                    return (
                      <div key={serviceId} className="broadcast-card">
                        <div className="broadcast-card-header">
                          <div className="broadcast-card-title">
                            {svc?.icon}
                            <span>{svc?.name || serviceId}</span>
                            {svc?.category === 'cli' && (
                              <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.1)', padding: '2px 5px', borderRadius: '4px' }}>
                                CLI
                              </span>
                            )}
                          </div>
                          <span className={`status-pill ${res.status}`}>{res.status.toUpperCase()}</span>
                        </div>

                        <div className="broadcast-card-body">
                          {res.text || (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Response will appear here...
                            </span>
                          )}
                          {res.status === 'error' && svc?.category === 'web' && (
                            <div style={{ marginTop: '12px' }}>
                              <button
                                className="primary-btn interactive"
                                style={{ fontSize: '11px', padding: '6px 12px' }}
                                onClick={() => setActiveService(serviceId)}
                              >
                                Open {svc.name} Tab to Log In &rarr;
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="broadcast-card-footer">
                          {res.text && (
                            <button
                              className="copy-btn"
                              onClick={() => copyToClipboard(res.text, serviceId)}
                              title="Copy response"
                            >
                              {copiedId === serviceId ? <Check size={14} /> : <Copy size={14} />}
                              <span>{copiedId === serviceId ? 'Copied' : 'Copy'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

export default App
