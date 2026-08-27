'use strict'

function disabled() {
  const error = new Error('Spreadsheet parsing is disabled in the governed Flowise runtime')
  error.code = 'I10_FLOWISE_XLSX_DISABLED'
  throw error
}

module.exports = new Proxy(disabled, {
  apply: disabled,
  get: () => disabled
})
