import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLinkIcon } from 'lucide-react';

import { api } from '@/shared/api';
import type { SalidaInfo } from '@/shared/types';
import { Markdown } from '@/modules/chat/transcript/Markdown';

type SalidaPreviewProps = {
  projectId: string;
  salida: SalidaInfo;
};

type BlobPreviewState = {
  loading: boolean;
  error: string | null;
  objectUrl: string | null;
  blob: Blob | null;
};

/** True for the two types the server itself resolves to a text mime (`text/markdown`, `text/plain`, `text/csv`) — everything else is binary and goes through a blob URL. */
const TEXTO_MIME: Partial<Record<SalidaInfo['tipo'], string>> = { tabla: 'text/csv', texto: 'text/plain' };

const isTextTipo = (tipo: SalidaInfo['tipo']): boolean => tipo === 'texto' || tipo === 'tabla';

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Abre la salida en una pestaña nueva. La URL tiene que ser un blob porque el
 * contenido exige el header de auth: un link directo al endpoint daría 401.
 *
 * El HTML del agente NO se abre directo: un blob hereda el origen de la app,
 * así que su script podría leer el token de localStorage. Se abre una página
 * mínima propia que lo carga en el mismo iframe sandbox de la vista previa
 * (sin `allow-same-origin`). PDF, imágenes y texto no ejecutan nada y van
 * directo.
 *
 * Se llama sincrónico dentro del clic, con el blob ya cargado: un
 * `window.open` después de un `await` lo frena el bloqueador de popups.
 * Los blob URL de la pestaña nueva no se revocan: viven lo que viva esta
 * pestaña, y revocarlos rompería la otra al recargar.
 */
function abrirEnPestanaNueva(salida: SalidaInfo, url: string): void {
  let destino = url;
  if (salida.tipo === 'html') {
    const envoltorio = `<!doctype html><html lang="es"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<title>${escaparHtml(salida.id)}</title>`
      + `<style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style>`
      + `</head><body><iframe title="${escaparHtml(salida.id)}" src="${url}" sandbox="allow-scripts allow-popups"></iframe></body></html>`;
    destino = URL.createObjectURL(new Blob([envoltorio], { type: 'text/html' }));
  }
  window.open(destino, '_blank', 'noopener');
}

/** Fila fija arriba de la vista previa: nombre del archivo y "abrir en pestaña nueva". */
function BarraPreview({ salida, onAbrir }: { salida: SalidaInfo; onAbrir: (() => void) | null }) {
  const { t } = useTranslation('chat');
  const etiqueta = t('salidasPanel.openInNewTab', { defaultValue: 'Abrir en pestaña nueva' });
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={salida.id}>{salida.id}</span>
      <button
        type="button"
        onClick={onAbrir ?? undefined}
        disabled={!onAbrir}
        title={etiqueta}
        aria-label={etiqueta}
        className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-40"
      >
        <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
        <span>{t('salidasPanel.openInNewTabShort', { defaultValue: 'Pestaña nueva' })}</span>
      </button>
    </div>
  );
}

/**
 * Splits one CSV line on commas outside of double quotes — enough for the
 * simple, agent-generated tables this panel previews, not a general CSV
 * parser (no embedded newlines inside a quoted field).
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === ',' && !insideQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function CsvTable({ content }: { content: string }) {
  const rows = content.split(/\r?\n/).filter((line) => line.length > 0).map(splitCsvLine);
  if (rows.length === 0) {
    return null;
  }
  const [header, ...body] = rows;

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th
                key={index}
                className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Fetches a text output (`tabla`/`texto`) once and renders it: CSV as a
 * table, Markdown through the shared renderer, plain text as-is.
 */
function TextSalidaPreview({ projectId, salida }: SalidaPreviewProps) {
  const { t } = useTranslation('chat');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setContent(null);
    setError(null);

    (async () => {
      try {
        const response = await api.salidas.contentBlob(projectId, salida.id, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        if (!cancelled) setContent(text);
      } catch (loadError: unknown) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        if (!cancelled) {
          setError(t('salidasPanel.previewError', { defaultValue: 'No se pudo cargar la salida.' }));
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, salida.id, t]);

  let cuerpo: React.ReactNode;
  if (error) {
    cuerpo = <p className="p-3 text-sm text-destructive">{error}</p>;
  } else if (content === null) {
    cuerpo = <p className="p-3 text-sm text-muted-foreground">{t('salidasPanel.loading', { defaultValue: 'Cargando…' })}</p>;
  } else if (salida.tipo === 'tabla') {
    cuerpo = <CsvTable content={content} />;
  } else if (salida.id.toLowerCase().endsWith('.md')) {
    cuerpo = <div className="p-3"><Markdown>{content}</Markdown></div>;
  } else {
    cuerpo = <pre className="whitespace-pre-wrap break-words p-3 text-sm">{content}</pre>;
  }

  const onAbrir = content === null ? null : () => {
    const mime = `${TEXTO_MIME[salida.tipo] ?? 'text/plain'};charset=utf-8`;
    abrirEnPestanaNueva(salida, URL.createObjectURL(new Blob([content], { type: mime })));
  };

  return (
    <>
      <BarraPreview salida={salida} onAbrir={onAbrir} />
      <div className="min-h-0 flex-1 overflow-auto">{cuerpo}</div>
    </>
  );
}

/**
 * Fetches a binary output (`html`/`pdf`/`imagen`) once as a blob and renders
 * it through an object URL, revoked on unmount or when the selection
 * changes — same lifecycle `ImageViewer.tsx` uses for workspace file blobs.
 */
function BlobSalidaPreview({ projectId, salida }: SalidaPreviewProps) {
  const { t } = useTranslation('chat');
  const [state, setState] = useState<BlobPreviewState>({ loading: true, error: null, objectUrl: null, blob: null });

  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setState({ loading: true, error: null, objectUrl: null, blob: null });

    (async () => {
      try {
        const response = await api.salidas.contentBlob(projectId, salida.id, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setState({ loading: false, error: null, objectUrl, blob });
      } catch (loadError: unknown) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setState({
          loading: false,
          error: t('salidasPanel.previewError', { defaultValue: 'No se pudo cargar la salida.' }),
          objectUrl: null,
          blob: null,
        });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, salida.id, t]);

  let cuerpo: React.ReactNode;
  if (state.loading) {
    cuerpo = <p className="p-3 text-sm text-muted-foreground">{t('salidasPanel.loading', { defaultValue: 'Cargando…' })}</p>;
  } else if (state.error || !state.objectUrl) {
    cuerpo = <p className="p-3 text-sm text-destructive">{state.error}</p>;
  } else if (salida.tipo === 'imagen') {
    cuerpo = (
      <div className="flex h-full items-center justify-center overflow-auto p-3">
        <img src={state.objectUrl} alt={salida.id} className="max-h-full max-w-full object-contain" />
      </div>
    );
  } else {
    // html and pdf both render in a sandboxed iframe. `allow-same-origin` is
    // intentionally omitted so agent-authored HTML never runs with this app's
    // own origin/cookies.
    cuerpo = (
      <iframe
        title={salida.id}
        src={state.objectUrl}
        sandbox="allow-scripts allow-popups"
        className="h-full w-full border-0 bg-white"
      />
    );
  }

  // La pestaña nueva recibe su propia copia del blob: el de la vista previa
  // se revoca al cambiar de selección y dejaría la pestaña en blanco.
  const blob = state.blob;
  const onAbrir = blob ? () => abrirEnPestanaNueva(salida, URL.createObjectURL(blob)) : null;

  return (
    <>
      <BarraPreview salida={salida} onAbrir={onAbrir} />
      <div className="min-h-0 flex-1 overflow-hidden">{cuerpo}</div>
    </>
  );
}

/** Rendered by PanelSalidas for the selected output; picks the text or blob path by `tipo`. */
export default function SalidaPreview({ projectId, salida }: SalidaPreviewProps) {
  if (isTextTipo(salida.tipo)) {
    return <TextSalidaPreview projectId={projectId} salida={salida} />;
  }
  return <BlobSalidaPreview projectId={projectId} salida={salida} />;
}
