import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/user.model.js';
import { deductCredits, refundCredits, settleCredits } from '../utils/deductCredits.js';

test('credit reservation debit is conditional and refund is idempotent', async t => {
  const state = { credits: 3, reservations: new Set() };
  t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter._id, 'user');
    assert.equal(filter.credits.$gte, 3);
    if (state.credits < filter.credits.$gte || state.reservations.has(filter.creditReservations.$ne)) return null;
    state.credits += update.$inc.credits;
    state.reservations.add(update.$addToSet.creditReservations);
    return { credits: state.credits };
  });
  t.mock.method(User, 'exists', async () => true);
  t.mock.method(User, 'updateOne', async (filter, update) => {
    if (filter.creditReservations && !state.reservations.has(filter.creditReservations)) return;
    state.credits += update.$inc?.credits || 0;
    state.reservations.delete(update.$pull.creditReservations);
  });
  await deductCredits({ userId: 'user', credits: 3, reservationId: 'run1' });
  assert.equal(state.credits, 0);
  await assert.rejects(deductCredits({ userId: 'user', credits: 3, reservationId: 'run2' }), { status: 402 });
  await refundCredits({ userId: 'user', credits: 3, reservationId: 'run1' });
  await refundCredits({ userId: 'user', credits: 3, reservationId: 'run1' });
  assert.equal(state.credits, 3);
  await deductCredits({ userId: 'user', credits: 3, reservationId: 'run3' });
  await settleCredits({ userId: 'user', reservationId: 'run3' });
  await refundCredits({ userId: 'user', credits: 3, reservationId: 'run3' });
  assert.equal(state.credits, 0);
});
