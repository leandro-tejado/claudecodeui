import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
};

/** True for the two types the server itself resolves to a text mime (`text/markdown`, `text/plain`, `text/csv`) — everything else is binary and goes through a blob URL. */
const isTextTipo = (tipo: SalidaInfo['tipo']): boolean => tipo === 'texto' || tipo === 'tabla';

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

  if (error) {
    return <p className="p-3 text-sm text-destructive">{error}</p>;
  }
  if (content === null) {
    return <p className="p-3 text-sm text-muted-foreground">{t('salidasPanel.loading', { defaultValue: 'Cargando…' })}</p>;
  }
  if (salida.tipo === 'tabla') {
    return <CsvTable content={content} />;
  }
  if (salida.id.toLowerCase().endsWith('.md')) {
    return <div className="p-3"><Markdown>{content}</Markdown></div>;
  }
  return <pre className="whitespace-pre-wrap break-words p-3 text-sm">{content}</pre>;
}

/**
 * Fetches a binary output (`html`/`pdf`/`imagen`) once as a blob and renders
 * it through an object URL, revoked on unmount or when the selection
 * changes — same lifecycle `ImageViewer.tsx` uses for workspace file blobs.
 */
function BlobSalidaPreview({ projectId, salida }: SalidaPreviewProps) {
  const { t } = useTranslation('chat');
  const [state, setState] = useState<BlobPreviewState>({ loading: true, error: null, objectUrl: null });

  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setState({ loading: true, error: null, objectUrl: null });

    (async () => {
      try {
        const response = await api.salidas.contentBlob(projectId, salida.id, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setState({ loading: false, error: null, objectUrl });
      } catch (loadError: unknown) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setState({
          loading: false,
          error: t('salidasPanel.previewError', { defaultValue: 'No se pudo cargar la salida.' }),
          objectUrl: null,
        });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, salida.id, t]);

  if (state.loading) {
    return <p className="p-3 text-sm text-muted-foreground">{t('salidasPanel.loading', { defaultValue: 'Cargando…' })}</p>;
  }
  if (state.error || !state.objectUrl) {
    return <p className="p-3 text-sm text-destructive">{state.error}</p>;
  }

  if (salida.tipo === 'imagen') {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-3">
        <img src={state.objectUrl} alt={salida.id} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  // html and pdf both render in a sandboxed iframe. `allow-same-origin` is
  // intentionally omitted so agent-authored HTML never runs with this app's
  // own origin/cookies.
  return (
    <iframe
      title={salida.id}
      src={state.objectUrl}
      sandbox="allow-scripts allow-popups"
      className="h-full w-full border-0 bg-white"
    />
  );
}

/** Rendered by PanelSalidas for the selected output; picks the text or blob path by `tipo`. */
export default function SalidaPreview({ projectId, salida }: SalidaPreviewProps) {
  if (isTextTipo(salida.tipo)) {
    return <TextSalidaPreview projectId={projectId} salida={salida} />;
  }
  return <BlobSalidaPreview projectId={projectId} salida={salida} />;
}
