// Extract only labelled user values. Model guesses and unrelated balances are not bindings.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const separator = '\\s*(?:为|是|:|：|=|#)?\\s*'
const cents = value => {
  const [whole, fraction = ''] = value.split('.')
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString()
}
export function explicitTransferInput(goal) {
  const values = {}, missingFields = []
  const matches = pattern => [...goal.matchAll(pattern)]
  const amounts = matches(/(?:转账(?:金额)?|\b(?:transfer(?:\s+(?:amount|of))?|amount)\b)\s*[:：=]?\s*([0-9]+(?:\.[0-9]{1,2})?)(?![0-9.])\s*([A-Z]{3})?/gu)
  const candidates = {
    payerAccountId: matches(new RegExp('(?:付款账户|\\bpayerAccountId\\b|\\bpayer\\s+account\\b)' + separator + '([1-9][0-9]{0,18})(?![0-9])', 'giu')).map(m => m[1]),
    payeeRef: matches(new RegExp('(?:收款人|收款方|\\bpayeeRef\\b|\\bbeneficiary\\b)' + separator + '(' + uuid + ')', 'giu')).map(m => m[1].toLowerCase()),
    amount: amounts.map(m => m[1]),
    currency: [...amounts.map(m => m[2]).filter(Boolean), ...matches(/(?:币种|\bcurrency\b)\s*[:：=]\s*([A-Z]{3})\b/gu).map(m => m[1])],
    purpose: matches(/(?:用途|\bpurpose\b)\s*[:：=]\s*([^，,。；;\r\n]+)/giu).map(m => m[1].trim()),
  }
  for (const [field, found] of Object.entries(candidates)) {
    const distinct = new Set(field === 'amount' ? found.map(cents) : found)
    if (distinct.size !== 1) missingFields.push(`businessInputs.${field}`)
    else values[field] = found[0]
  }
  return { values, missingFields }
}
export function transferInputMatches(actual, expected) {
  return Object.keys(expected).every(field => field === 'amount' ? cents(actual[field]) === cents(expected[field]) : actual[field] === expected[field])
}
