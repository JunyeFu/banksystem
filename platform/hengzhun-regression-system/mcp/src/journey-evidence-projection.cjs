'use strict'

const REFERENCE_FIELDS = Object.freeze([
  'caseId', 'preparationId', 'candidateId', 'certificateId', 'scriptId', 'scriptHash', 'planId',
  'confirmedDecisionEventId', 'taskId', 'runId', 'scheduleId', 'inboxId', 'resultArtifactId',
])

function boundedText(value, limit) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : undefined
}

function projectJourneyEvidenceFields(body) {
  const references = {}
  for (const field of REFERENCE_FIELDS) {
    const value = boundedText(body?.references?.[field], field === 'scriptHash' ? 64 : 160)
    if (value) references[field] = value
  }
  const artifactCards = Array.isArray(body?.artifactCards) ? body.artifactCards.slice(0, 16).map((card) => ({
    ...(boundedText(card?.artifactId, 160) ? { artifactId: boundedText(card.artifactId, 160) } : {}),
    ...(boundedText(card?.displayName, 240) ? { displayName: boundedText(card.displayName, 240) } : {}),
    ...(boundedText(card?.mediaType, 160) ? { mediaType: boundedText(card.mediaType, 160) } : {}),
    ...(/^[a-f0-9]{64}$/.test(String(card?.sha256 || '')) ? { sha256: card.sha256 } : {}),
    ...(Number.isSafeInteger(card?.size) && card.size >= 0 ? { size: card.size } : {}),
    downloadGrantRequired: card?.downloadGrantRequired === true,
  })).filter((card) => card.artifactId && card.displayName) : []
  return Object.freeze({ terminal: body?.terminal === true, references: Object.freeze(references), artifactCards: Object.freeze(artifactCards) })
}

module.exports = { REFERENCE_FIELDS, projectJourneyEvidenceFields }
