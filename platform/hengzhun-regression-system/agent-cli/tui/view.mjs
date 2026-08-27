import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'

function fit(text, width) {
  const clipped = truncateToWidth(String(text), Math.max(0, width))
  return `${clipped}${' '.repeat(Math.max(0, width - visibleWidth(clipped)))}`
}

function border(width) { return `+${'-'.repeat(Math.max(0, width - 2))}+` }

function boxLine(text, width) { return `|${fit(text, Math.max(0, width - 2))}|` }

function transcriptLines(state, width) {
  const bodyWidth = Math.max(1, width - 4)
  const lines = []
  for (const entry of state.transcript) {
    const prefix = ({ assistant: 'AI', proposal: 'PROPOSAL', error: 'ERROR', system: 'SYSTEM' })[entry.role] || 'USER'
    const wrapped = wrapTextWithAnsi(`${prefix}> ${entry.text}`, bodyWidth)
    lines.push(...wrapped.map((line) => boxLine(` ${line}`, width)))
  }
  return lines
}

function overlay(screen, modal, width, height) {
  if (!modal) return screen
  const modalWidth = Math.min(Math.max(36, Math.floor(width * 0.72)), Math.max(36, width - 4))
  const suffix = modal.proposalId.slice(-8)
  const content = [
    border(modalWidth),
    boxLine(` APPROVAL ${modal.risk}`, modalWidth),
    boxLine(` ${truncateToWidth(modal.summary, modalWidth - 4)}`, modalWidth),
    boxLine(` Proposal suffix: ${suffix}`, modalWidth),
    boxLine(modal.risk === 'HIGH' ? ` /approve ${suffix}` : ' /approve', modalWidth),
    boxLine(' /reject', modalWidth),
    border(modalWidth),
  ]
  const row = Math.max(1, Math.floor((height - content.length) / 2))
  const col = Math.max(0, Math.floor((width - modalWidth) / 2))
  const next = [...screen]
  for (let index = 0; index < content.length && row + index < height; index += 1) {
    const base = next[row + index]
    next[row + index] = `${base.slice(0, col)}${content[index]}${base.slice(col + modalWidth)}`
  }
  return next
}

export function renderTui(state, width, height, editorText = '') {
  if (!Number.isInteger(width) || width < 40 || !Number.isInteger(height) || height < 12) throw new Error('TUI_DIMENSIONS_UNSUPPORTED')
  const header = [border(width), boxLine(` HENGZHUN AGENT  session:${state.sessionId || '-'}  journey:${state.journeyId || '-'}`, width)]
  const stage = [boxLine(` STAGE ${state.stage}`, width)]
  const footer = [boxLine(` ${state.footerCode}  Ctrl+C exit`, width), boxLine(` > ${editorText}`, width), border(width)]
  const transcriptHeight = height - header.length - stage.length - footer.length
  const transcript = transcriptLines(state, width).slice(-transcriptHeight)
  while (transcript.length < transcriptHeight) transcript.unshift(boxLine('', width))
  const screen = [...header, ...transcript, ...stage, ...footer]
  const composed = overlay(screen, state.modal, width, height).map((line) => fit(line, width))
  if (composed.length !== height || composed.some((line) => visibleWidth(line) !== width)) throw new Error('TUI_RENDER_BOUNDS_INVALID')
  return composed
}
