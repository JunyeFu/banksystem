import { Input, matchesKey, ProcessTerminal, truncateToWidth, TuiAltScreen } from '@earendil-works/pi-tui'

import { TuiController } from './model.mjs'
import { renderTui } from './view.mjs'

class ApprovalOverlay {
  constructor(controller) { this.controller = controller }
  render(width) {
    const modal = this.controller.state.modal
    if (!modal) return []
    const suffix = modal.proposalId.slice(-8)
    return [
      `APPROVAL ${modal.risk}`,
      truncateToWidth(modal.summary, Math.max(1, width)),
      modal.risk === 'HIGH' ? `Type /approve ${suffix}` : 'Type /approve',
      'Type /reject',
    ]
  }
}

export class AgentTuiComponent {
  constructor({ controller, requestRender = () => undefined, heightProvider = () => 24 } = {}) {
    this.controller = controller
    this.requestRender = requestRender
    this.heightProvider = heightProvider
    this.input = new Input()
    this.focused = false
    this.input.onSubmit = (value) => {
      this.controller.submit(value)
      this.input.setValue('')
      this.requestRender()
    }
  }

  render(width) {
    return renderTui(this.controller.state, Math.max(40, width), Math.max(12, this.heightProvider() || 24), this.input.getValue())
  }

  handleInput(data) {
    if (matchesKey(data, 'ctrl+c')) {
      this.controller.cancel()
      return
    }
    this.input.handleInput(data)
    this.requestRender()
  }

  invalidate() { this.input.invalidate() }
}

export function createTerminalUi({
  onIntent = () => undefined,
  terminal = new ProcessTerminal(),
  tuiFactory = (value) => new TuiAltScreen(value),
} = {}) {
  const tui = tuiFactory(terminal)
  let overlayHandle = null
  let component
  const controller = new TuiController({
    onIntent(intent) {
      onIntent(intent)
    },
    onChange() {
      if (controller.state.modal && !overlayHandle) overlayHandle = tui.showOverlay(new ApprovalOverlay(controller), { width: '72%', anchor: 'center' })
      if (!controller.state.modal && overlayHandle) { overlayHandle.hide(); overlayHandle = null }
      tui.requestRender()
    },
  })
  component = new AgentTuiComponent({ controller, requestRender: () => tui.requestRender(), heightProvider: () => terminal.rows })
  tui.addChild(component)
  tui.setFocus(component)
  return Object.freeze({
    controller,
    component,
    start: () => tui.start(),
    stop: () => tui.stop(),
    receive: (event) => controller.receive(event),
  })
}
