// NFC card states, one set of words for the card office, the passenger app
// and the server. `is_active` stays the switch the boarding tablets check;
// `status` says why a card is not active. Older records have no status, so it
// is worked out from what they do have.

export const CARD_STATUSES = ['active', 'suspended', 'lost', 'revoked', 'replaced'] as const;
export type CardStatus = typeof CARD_STATUSES[number];

// The ways an office can stop a card. Replaced is only set by issuing a new card.
export const STOP_STATUSES = ['suspended', 'lost', 'revoked'] as const;
export type StopStatus = typeof STOP_STATUSES[number];

type CardLike = { is_active?: boolean; status?: string; revoke_reason?: string } | null | undefined;

export function cardStatus(card: CardLike): CardStatus | null {
  if (!card) return null;
  if (card.is_active === true) return 'active';
  if ((CARD_STATUSES as readonly string[]).includes(card.status || '') && card.status !== 'active') return card.status as CardStatus;
  return /^replaced/i.test(card.revoke_reason || '') ? 'replaced' : 'revoked';
}

// Only a suspended card can be switched back on. A lost card may have been
// copied, and revoked or replaced cards are finished: issue the card again
// (it gets a new record) or issue a new one.
export const canReactivate = (card: CardLike) => cardStatus(card) === 'suspended';

export const CARD_STATUS_TEXT: Record<CardStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  lost: 'Lost',
  revoked: 'Revoked',
  replaced: 'Replaced',
};

export const STOP_REASON: Record<StopStatus, string> = {
  suspended: 'Suspended',
  lost: 'Reported lost',
  revoked: 'Revoked',
};
