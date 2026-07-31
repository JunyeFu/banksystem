'use strict'

const DEFAULT_HEARTBEAT_SECONDS = 10
const BAR_WIDTH = 20

function enabledFromEnvironment(argv = process.argv, env = process.env) {
  return argv.includes('--progress') || env.HENGZHUN_PROGRESS === '1'
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function safeText(value) {
  return String(value ?? '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:API[_ -]?KEY|PASSWORD|TOKEN|SECRET)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500)
}

class ProgressReporter {
  constructor(operation, options = {}) {
    this.operation = String(operation || 'TASK').toUpperCase()
    this.enabled = options.enabled ?? enabledFromEnvironment()
    this.stream = options.stream || process.stderr
    this.clock = options.clock || (() => Date.now())
    this.startedAt = this.clock()
    this.lastActivityAt = this.startedAt
    this.lastRenderedAt = 0
    this.heartbeatSeconds = Math.max(1, Number(options.heartbeatSeconds || process.env.HENGZHUN_HEARTBEAT_SECONDS || DEFAULT_HEARTBEAT_SECONDS))
    this.stage = null
    this.timer = null
    this.cancelled = false
    this.cancelHandler = null
  }

  installCancellation(onCancel) {
    if (!this.enabled || this.cancelHandler) return
    this.cancelHandler = () => {
      if (this.cancelled) return
      this.cancelled = true
      this.line('收到Ctrl+C，正在安全中止并清理受管资源……', true)
      if (typeof onCancel === 'function') onCancel()
    }
    process.on('SIGINT', this.cancelHandler)
  }

  removeCancellation() {
    if (this.cancelHandler) process.removeListener('SIGINT', this.cancelHandler)
    this.cancelHandler = null
  }

  throwIfCancelled() {
    if (!this.cancelled) return
    const error = new Error('USER_CANCELLED')
    error.code = 'USER_CANCELLED'
    error.exitCode = 130
    throw error
  }

  startStage(stageIndex, stageTotal, stageName, options = {}) {
    this.stopHeartbeat()
    this.stage = {
      stageIndex: Number(stageIndex),
      stageTotal: Number(stageTotal),
      stageName: String(stageName),
      completed: options.completed,
      total: options.total,
      detail: options.detail || '',
      maxWaitHint: options.maxWaitHint || ''
    }
    this.lastActivityAt = this.clock()
    this.render(true)
    if (options.heartbeat !== false) this.startHeartbeat()
  }

  update(completed, total, detail = '', force = false) {
    if (!this.stage) return
    this.stage.completed = Number(completed)
    this.stage.total = Number(total)
    this.stage.detail = detail || this.stage.detail
    this.lastActivityAt = this.clock()
    this.render(force || completed === total)
  }

  activity(detail = '', force = true) {
    if (!this.stage) return
    if (detail) this.stage.detail = detail
    this.lastActivityAt = this.clock()
    this.render(force)
  }

  startHeartbeat() {
    if (!this.enabled || this.timer) return
    this.timer = setInterval(() => this.render(true, true), this.heartbeatSeconds * 1000)
    this.timer.unref?.()
  }

  stopHeartbeat() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  render(force = false, heartbeat = false) {
    if (!this.enabled || !this.stage) return
    const now = this.clock()
    if (!force && now - this.lastRenderedAt < 1000) return
    this.lastRenderedAt = now
    const { stageIndex, stageTotal, stageName, completed, total, detail, maxWaitHint } = this.stage
    const measurable = Number.isFinite(completed) && Number.isFinite(total) && total >= 0
    let counter = ''
    if (measurable) {
      const ratio = total === 0 ? 1 : Math.min(1, Math.max(0, completed / total))
      const filled = Math.round(ratio * BAR_WIDTH)
      counter = ` [${'#'.repeat(filled)}${'-'.repeat(BAR_WIDTH - filled)}] ${completed}/${total}`
    }
    const elapsed = formatDuration(now - this.startedAt)
    const waited = formatDuration(now - this.lastActivityAt)
    const suffix = [
      detail ? safeText(detail) : '',
      `已用：${elapsed}`,
      heartbeat ? `距最近活动：${waited}` : `最近活动：${new Date(this.lastActivityAt).toLocaleTimeString('zh-CN', { hour12: false })}`,
      maxWaitHint ? `预计：${safeText(maxWaitHint)}` : ''
    ].filter(Boolean).join('｜')
    this.line(`[${this.operation} ${stageIndex}/${stageTotal}]${counter} ${safeText(stageName)}${suffix ? `｜${suffix}` : ''}`, false)
  }

  line(message, forceNewline = false) {
    if (!this.enabled) return
    const text = safeText(message)
    const interactive = Boolean(this.stream.isTTY)
    if (interactive && !forceNewline) {
      this.stream.write(`\r${text.padEnd(Math.max(text.length, 120), ' ')}`)
    } else {
      this.stream.write(`${text}\n`)
    }
  }

  finish(status = '完成', detail = '') {
    this.stopHeartbeat()
    if (this.stage) this.render(true)
    this.line(`[${this.operation}] ${safeText(status)}｜总耗时：${formatDuration(this.clock() - this.startedAt)}${detail ? `｜${safeText(detail)}` : ''}`, true)
    this.removeCancellation()
  }

  fail(error, logPath = '') {
    this.stopHeartbeat()
    const code = error?.code || 'FAILED'
    const stage = this.stage ? `${this.stage.stageIndex}/${this.stage.stageTotal} ${this.stage.stageName}` : '未进入阶段'
    this.line(`[${this.operation}] 失败｜阶段：${safeText(stage)}｜错误码：${safeText(code)}｜原因：${safeText(error?.message || error)}｜已用：${formatDuration(this.clock() - this.startedAt)}${logPath ? `｜日志：${safeText(logPath)}` : ''}`, true)
    this.removeCancellation()
  }
}

module.exports = { ProgressReporter, enabledFromEnvironment, formatDuration, safeText }
