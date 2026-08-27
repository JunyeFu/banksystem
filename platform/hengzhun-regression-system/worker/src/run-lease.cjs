'use strict'

function startRunLeaseHeartbeat(task, options) {
  const initialDeadline = Date.parse(String(task?.leaseExpiresAt || ''))
  if (!task || typeof task.taskId !== 'string' || !Number.isInteger(task.leaseVersion) || !Number.isFinite(initialDeadline)) {
    throw Object.assign(new Error('WORKER_LEASE_IDENTITY_INVALID'), { code: 'WORKER_LEASE_IDENTITY_INVALID' })
  }
  const post = options?.post
  const workerId = options?.workerId
  if (typeof post !== 'function' || typeof workerId !== 'string' || workerId.length === 0) {
    throw Object.assign(new Error('WORKER_LEASE_HEARTBEAT_CONFIGURATION_INVALID'), { code: 'WORKER_LEASE_HEARTBEAT_CONFIGURATION_INVALID' })
  }
  const intervalMs = options?.intervalMs ?? 30_000
  const schedule = options?.setIntervalFn ?? setInterval
  const cancel = options?.clearIntervalFn ?? clearInterval
  const scheduleExpiry = options?.setTimeoutFn ?? setTimeout
  const cancelExpiry = options?.clearTimeoutFn ?? clearTimeout
  const now = options?.nowFn ?? Date.now
  let stopped = false
  let inFlight = false
  let leaseConflict = null
  let leaseDeadline = initialDeadline
  let expiryTimer
  const controller = new AbortController()

  const loseLease = error => {
    if (leaseConflict) return
    leaseConflict = error?.code === 'WORKER_LEASE_CONFLICT'
      ? error
      : Object.assign(new Error('WORKER_LEASE_CONFLICT'), { code: 'WORKER_LEASE_CONFLICT', cause: error })
    controller.abort(leaseConflict)
  }
  const armExpiry = deadline => {
    if (expiryTimer) cancelExpiry(expiryTimer)
    leaseDeadline = deadline
    expiryTimer = scheduleExpiry(() => loseLease(Object.assign(new Error('WORKER_LEASE_EXPIRED'), {
      code: 'WORKER_LEASE_CONFLICT'
    })), Math.max(0, deadline - now()))
    expiryTimer?.unref?.()
  }
  armExpiry(initialDeadline)

  const renew = async () => {
    if (stopped || inFlight || leaseConflict) return
    inFlight = true
    try {
      const renewed = await post(`/internal/worker/tasks/${encodeURIComponent(task.taskId)}:renew`, {
        workerId,
        leaseVersion: task.leaseVersion
      })
      const renewedDeadline = Date.parse(String(renewed?.leaseExpiresAt || ''))
      if (renewed?.taskId !== task.taskId || renewed?.workerId !== workerId
        || renewed?.leaseVersion !== task.leaseVersion || renewed?.status !== 'RENEWED'
        || !Number.isFinite(renewedDeadline) || renewedDeadline <= now()) {
        loseLease(Object.assign(new Error('WORKER_LEASE_RENEWAL_RESPONSE_INVALID'), { code: 'WORKER_LEASE_CONFLICT' }))
      } else {
        armExpiry(renewedDeadline)
      }
    } catch (error) {
      if (error?.code === 'WORKER_LEASE_CONFLICT') loseLease(error)
      // A transport failure never invents additional lease time. The current
      // server-issued deadline remains armed while a later heartbeat retries.
    } finally {
      inFlight = false
    }
  }
  const timer = schedule(() => { void renew() }, intervalMs)
  timer?.unref?.()
  return {
    assertCurrent() {
      if (!leaseConflict && now() >= leaseDeadline) {
        loseLease(Object.assign(new Error('WORKER_LEASE_EXPIRED'), { code: 'WORKER_LEASE_CONFLICT' }))
      }
      if (leaseConflict) throw leaseConflict
    },
    signal: controller.signal,
    stop() {
      stopped = true
      cancel(timer)
      if (expiryTimer) cancelExpiry(expiryTimer)
    }
  }
}

module.exports = { startRunLeaseHeartbeat }
