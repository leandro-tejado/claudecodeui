import express from 'express';

import { cuentaParaRuta, listarCuentas } from './services/cuentas.service.js';

const router = express.Router();

/** Las cuentas que se pueden elegir. Nunca trae la ruta ni el valor de una credencial. */
router.get('/', (_request, response, next) => {
  try {
    response.json({ cuentas: listarCuentas() });
  } catch (error) {
    next(error);
  }
});

/**
 * La cuenta que `rutas` de cuentas.json le da a un proyecto: el valor por
 * defecto del selector de una sesion nueva. Nunca mira la cuota.
 */
router.get('/para', async (request, response, next) => {
  try {
    response.json({ cuenta: await cuentaParaRuta(request.query.ruta) });
  } catch (error) {
    next(error);
  }
});

export default router;
