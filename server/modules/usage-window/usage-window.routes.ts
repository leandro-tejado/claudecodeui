import express from 'express';

import { getUsageWindow } from './services/usage-window.service.js';

const router = express.Router();

/** Parses an ISO instant or an epoch-ms number into epoch ms. */
function readInstant(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && value.trim() === String(asNumber)) return asNumber;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The current five-hour window.
 *
 * `desde`/`hasta` exist to check the maths against a window whose outcome is
 * already known — the two that ran out on 09-sep — rather than trusting that
 * the numbers look plausible.
 */
router.get('/', async (request, response, next) => {
  try {
    const desde = readInstant(request.query.desde);
    const hasta = readInstant(request.query.hasta);
    const snapshot = await getUsageWindow(desde === undefined ? undefined : { desde, hasta });
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
