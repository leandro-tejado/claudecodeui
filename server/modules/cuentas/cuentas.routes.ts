import express from 'express';

import { listarCuentas } from './services/cuentas.service.js';

const router = express.Router();

/** Las cuentas que se pueden elegir. Nunca trae la ruta ni el valor de una credencial. */
router.get('/', (_request, response, next) => {
  try {
    response.json({ cuentas: listarCuentas() });
  } catch (error) {
    next(error);
  }
});

export default router;
