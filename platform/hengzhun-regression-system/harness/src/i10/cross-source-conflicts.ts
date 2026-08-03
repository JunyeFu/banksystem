import { createHash } from 'node:crypto';
import type { CaseDraft } from './schemas';

type CaseFact = CaseDraft['caseFacts'][number];

export interface CrossSourceConflict {
  conflictKey: string;
  field: CaseFact['field'];
  videoValue: string;
  imageValue: string;
  videoProvenanceRef: string;
  imageProvenanceRefs: string[];
}

const normalizeComparable = (value: string): string =>
  value.normalize('NFKC').replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, '').toLowerCase();

const factId = (conflictKey: string, side: 'video' | 'image', value: string): string =>
  `conflict_${createHash('sha256').update(`${conflictKey}:${side}:${value}`).digest('hex').slice(0, 24)}`;

const draftText = (draft: CaseDraft): string => [
  draft.title,
  draft.objective,
  draft.summary,
  draft.targetSystem ?? '',
  draft.entryUrl ?? '',
  ...draft.preconditions,
  ...draft.steps.flatMap(step => [step.action, step.expected]),
  ...draft.assertions
].join('\n');

const videoFacts = (draft: CaseDraft): CaseFact[] =>
  draft.caseFacts.filter(fact => fact.provenanceRefs.some(ref => ref.startsWith('video:')));

const videoComparableText = (draft: CaseDraft): string =>
  [draftText(draft), ...videoFacts(draft).map(fact => fact.value)].join('\n');

const exactConflict = (
  key: string,
  field: CaseFact['field'],
  videoValue: string | undefined,
  imageFact: CaseFact
): CrossSourceConflict | undefined => {
  if (!videoValue) return undefined;
  const left = normalizeComparable(videoValue);
  const right = normalizeComparable(imageFact.value);
  if (!left || !right || left === right) return undefined;
  return {
    conflictKey: key,
    field,
    videoValue,
    imageValue: imageFact.value,
    videoProvenanceRef: '',
    imageProvenanceRefs: imageFact.provenanceRefs
  };
};

export const detectCrossSourceConflicts = (
  draft: CaseDraft,
  imageFacts: CaseFact[]
): CrossSourceConflict[] => {
  const conflicts: CrossSourceConflict[] = [];
  const sourceText = videoComparableText(draft);
  const sourcedVideoFacts = videoFacts(draft);

  for (const imageFact of imageFacts) {
    let conflict: CrossSourceConflict | undefined;
    if (imageFact.field === 'ENTRY_URL') {
      conflict = exactConflict('ENTRY_URL', 'ENTRY_URL', draft.entryUrl, imageFact);
    } else if (imageFact.field === 'TARGET_SYSTEM') {
      conflict = exactConflict('TARGET_SYSTEM', 'TARGET_SYSTEM', draft.targetSystem, imageFact);
    } else {
      const imageHasPersonalProfile = /个人资料/.test(imageFact.value);
      const imageHasCustomerProfile = /客户资料/.test(imageFact.value) && !/个人资料/.test(imageFact.value);
      const videoHasPersonalProfile = /个人资料/.test(sourceText);
      const videoHasCustomerProfile = /客户资料/.test(sourceText) && !/个人资料/.test(sourceText);
      if ((imageHasPersonalProfile && videoHasCustomerProfile) || (imageHasCustomerProfile && videoHasPersonalProfile)) {
        const matchingVideoFact = sourcedVideoFacts.find(fact =>
          videoHasCustomerProfile ? /客户资料/.test(fact.value) && !/个人资料/.test(fact.value) : /个人资料/.test(fact.value)
        );
        conflict = {
          conflictKey: 'PAGE_LABEL',
          field: 'OTHER',
          videoValue: videoHasCustomerProfile ? '客户资料' : '个人资料',
          imageValue: imageHasPersonalProfile ? '个人资料' : '客户资料',
          videoProvenanceRef: matchingVideoFact?.provenanceRefs[0] ?? '',
          imageProvenanceRefs: imageFact.provenanceRefs
        };
      }
    }
    if (conflict && !conflicts.some(item => item.conflictKey === conflict?.conflictKey)) {
      conflicts.push({
        ...conflict,
        videoProvenanceRef: conflict.videoProvenanceRef || `video:${draft.source.sourceRef}`
      });
    }
  }
  return conflicts;
};

export const applyCrossSourceConflictGate = (
  draft: CaseDraft,
  imageFacts: CaseFact[]
): CaseDraft => {
  const conflicts = detectCrossSourceConflicts(draft, imageFacts);
  const existingVideoFacts = videoFacts(draft);
  if (conflicts.length === 0) {
    return {
      ...draft,
      caseFacts: [
        ...imageFacts,
        ...existingVideoFacts.filter(prior => !imageFacts.some(current => current.factId === prior.factId))
      ]
    };
  }

  const conflictKeys = new Set(conflicts.map(conflict => conflict.conflictKey));
  const gatedImageFacts = imageFacts.map(fact => {
    const related = conflicts.find(conflict =>
      conflict.imageProvenanceRefs.some(ref => fact.provenanceRefs.includes(ref))
    );
    return related ? { ...fact, requiresUserConfirmation: true } : fact;
  });
  const conflictVideoFacts: CaseFact[] = conflicts.map(conflict => ({
    factId: factId(conflict.conflictKey, 'video', conflict.videoValue),
    field: conflict.field,
    value: conflict.videoValue,
    provenanceRefs: [conflict.videoProvenanceRef],
    confidence: Math.min(draft.confidence, 0.99),
    selected: true,
    requiresUserConfirmation: true
  }));

  return {
    ...draft,
    caseFacts: [
      ...gatedImageFacts,
      ...existingVideoFacts,
      ...conflictVideoFacts.filter(candidate => !existingVideoFacts.some(current =>
        current.value === candidate.value &&
        current.provenanceRefs.some(ref => candidate.provenanceRefs.includes(ref))
      ))
    ],
    missingFields: [
      ...draft.missingFields.filter(field => !field.startsWith('crossSourceConflict:')),
      ...[...conflictKeys].sort().map(key => `crossSourceConflict:${key}`)
    ],
    confirmationStatus: 'WAITING_USER'
  };
};
