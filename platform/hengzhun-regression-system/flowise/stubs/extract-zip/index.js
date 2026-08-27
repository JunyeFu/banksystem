'use strict'

module.exports = async function disabledExtractZip() {
  const error = new Error('Archive extraction is disabled in the governed Flowise runtime')
  error.code = 'I10_FLOWISE_EXTRACT_ZIP_DISABLED'
  throw error
}
