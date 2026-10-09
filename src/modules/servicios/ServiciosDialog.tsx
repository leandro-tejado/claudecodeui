import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';

/*
 * La vista «Servicios» (boceto 09-oct, escena 8): qué escucha en el VPS y por
 * dónde se entra, agrupado por exposición. Solo lectura: sale de
 * `GET /api/system/servicios` (`ss -tlnpH` + `tailscale serve status`).
 */

type Exposicion = 'publico' | 'tailnet' | 'local';

export type Servicio = {
  puerto: number;
  nombre: string;
  proceso: string | null;
  exposicion: Exposicion;
  entrada: string | null;
};

const GRUPOS: { id: Exposicion; titulo: string; nota: string }[] = [
  { id: 'publico', titulo: 'Público', nota: 'internet' },
  { id: 'tailnet', titulo: 'Tailnet', nota: 'solo tus dispositivos' },
  { id: 'local', titulo: 'Solo local', nota: 'esta máquina' },
];

const PUNTO: Record<Exposicion, string> = {
  publico: 'bg-ds-signal-warn',
  tailnet: 'bg-ds-signal-good',
  local: 'bg-ds-faint',
};

export function ListaServicios({ servicios }: { servicios: Servicio[] }) {
  return (
    <div className="space-y-4">
      {GRUPOS.map((grupo) => {
        const delGrupo = servicios.filter((s) => s.exposicion === grupo.id);
        if (delGrupo.length === 0) return null;
        return (
          <section key={grupo.id} aria-label={grupo.titulo} data-testid={`servicios-${grupo.id}`}>
            <h4 className="mb-1 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              {grupo.titulo}
              <span className="font-normal normal-case tracking-normal text-ds-faint">{grupo.nota}</span>
            </h4>
            <ul className="divide-y divide-border/60 rounded-ds-lg border border-border/60">
              {delGrupo.map((s) => (
                <li key={s.puerto} className="flex items-center gap-2.5 px-3 py-1.5 text-sm">
                  <span className={`h-1.5 w-1.5 flex-none rounded-full ${PUNTO[s.exposicion]}`} aria-hidden="true" />
                  <span className={s.nombre === 'sin nombre' ? 'min-w-0 flex-1 truncate italic text-ds-faint' : 'min-w-0 flex-1 truncate text-foreground'}>
                    {s.nombre}
                  </span>
                  {s.entrada && <span className="flex-none text-xs text-muted-foreground">{s.entrada}</span>}
                  <span className="w-14 flex-none text-right font-mono text-xs tabular-nums text-muted-foreground">:{s.puerto}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function ServiciosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await authenticatedFetch('/api/system/servicios');
      const cuerpo = (await respuesta.json()) as { servicios?: Servicio[]; error?: string | null };
      setServicios(cuerpo.servicios ?? []);
      setError(respuesta.ok ? cuerpo.error ?? null : `HTTP ${respuesta.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Se pide al abrir, atado al gesto: nada de sondeo en segundo plano.
  useEffect(() => {
    if (open) void cargar();
  }, [open, cargar]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogTitle>Servicios</DialogTitle>
        <h3 className="mb-3 text-base font-semibold text-foreground">Servicios</h3>
        {error && <p className="mb-3 text-sm text-ds-signal-bad">{error}</p>}
        {servicios === null && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {servicios && <ListaServicios servicios={servicios} />}
      </DialogContent>
    </Dialog>
  );
}
