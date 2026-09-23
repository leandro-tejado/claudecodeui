import path from 'node:path';

import type {
  SalidaInfo,
  SalidaTipo,
  SalidasServiceDependencies,
  SalidasServices,
} from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

const INFORMES_DIRECTORY_NAME = '.informes';
// Same cap as the sibling servidor-code Fase 5: nothing this big streams
// through a request/response cycle.
const MAXIMUM_SALIDA_BYTES = 25 * 1024 * 1024;

/**
 * Extension whitelist shared with the sibling `servidor-code` Fase 5 (plan
 * `23-septiembre-streaming-respuesta-claude.md`, "LISTA BLANCA COMUN").
 * Anything not listed here — `.env`, dotfiles, no extension — resolves to
 * `null` from `tipoDeSalida` and is therefore never listed or served.
 */
const TIPO_POR_EXTENSION: Record<string, { tipo: SalidaTipo; mime: string }> = {
  html: { tipo: 'html', mime: 'text/html' },
  pdf: { tipo: 'pdf', mime: 'application/pdf' },
  png: { tipo: 'imagen', mime: 'image/png' },
  jpg: { tipo: 'imagen', mime: 'image/jpeg' },
  jpeg: { tipo: 'imagen', mime: 'image/jpeg' },
  webp: { tipo: 'imagen', mime: 'image/webp' },
  // SVG can carry a script, so routes must always pair this mime with a strict
  // `content-security-policy: default-src 'none'` when serving it.
  svg: { tipo: 'imagen', mime: 'image/svg+xml' },
  csv: { tipo: 'tabla', mime: 'text/csv' },
  md: { tipo: 'texto', mime: 'text/markdown' },
  txt: { tipo: 'texto', mime: 'text/plain' },
};

/**
 * Pure whitelist lookup shared by listing and serving.
 *
 * `path.extname` already returns `''` for dotfiles (`.env`) and for names
 * with no extension, so both fall out of the map lookup the same way any
 * other unknown extension does — no separate dotfile check needed.
 */
export function tipoDeSalida(nombre: string): { tipo: SalidaTipo; mime: string } | null {
  const extension = path.extname(nombre).slice(1).toLowerCase();
  if (!extension) return null;
  return TIPO_POR_EXTENSION[extension] ?? null;
}

function createSalidaError(message: string, statusCode: number, code: string): AppError {
  return new AppError(message, { statusCode, code });
}

function readErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
}

function resolveInformesDirectory(projectRoot: string): string {
  return path.join(projectRoot, INFORMES_DIRECTORY_NAME);
}

/**
 * Resolves a listed id to an absolute path strictly inside `.informes/`.
 *
 * Two guards, same order File Tree's `resolvePathInsideProject` uses: reject
 * anything that could escape the directory (a separator or a `..` segment)
 * before a path is even built from it, then re-check the resolved path still
 * starts with the directory prefix. `id` is meant to be a bare filename, so
 * any separator is already invalid input, not a traversal attempt worth
 * silently normalizing.
 */
function resolveSalidaPath(projectRoot: string, id: string): string {
  if (!id || !id.trim() || /[\\/]/.test(id) || id === '.' || id === '..') {
    throw createSalidaError('Invalid output id', 400, 'INVALID_SALIDA_ID');
  }

  const informesDirectory = resolveInformesDirectory(projectRoot);
  const resolvedPath = path.resolve(informesDirectory, id);
  const normalizedInformesDirectory = path.resolve(informesDirectory) + path.sep;
  if (!resolvedPath.startsWith(normalizedInformesDirectory)) {
    throw createSalidaError('Output must be under .informes', 400, 'SALIDA_PATH_OUTSIDE_INFORMES');
  }

  return resolvedPath;
}

/**
 * Creates the Salidas application service for the module composition root
 * and its tests. Lists and serves `<proyecto>/.informes/`, the convention
 * `salidas-convencion.ts` tells the agent about via the system prompt.
 */
export function createSalidasService(dependencies: SalidasServiceDependencies): SalidasServices {
  async function resolveProjectRoot(projectId: string): Promise<string> {
    const projectRoot = await dependencies.projects.getProjectPathById(projectId);
    if (!projectRoot) {
      throw createSalidaError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }
    return projectRoot;
  }

  return {
    async listarSalidas(projectId) {
      const projectRoot = await resolveProjectRoot(projectId);
      const informesDirectory = resolveInformesDirectory(projectRoot);

      let entryNames: string[];
      try {
        entryNames = await dependencies.fileSystem.readDirectory(informesDirectory);
      } catch (error) {
        // No agent has produced an output yet — an empty panel, not an error.
        if (readErrorCode(error) === 'ENOENT') {
          return [];
        }
        dependencies.logger.error(`Error reading .informes for project "${projectId}"`, error);
        return [];
      }

      const salidas: SalidaInfo[] = [];
      for (const entryName of entryNames) {
        const tipo = tipoDeSalida(entryName);
        if (!tipo) continue;

        const entryPath = path.join(informesDirectory, entryName);
        try {
          const stats = await dependencies.fileSystem.stat(entryPath);
          if (!stats.isFile()) continue;
          salidas.push({
            id: entryName,
            tipo: tipo.tipo,
            bytes: stats.size,
            ts: stats.mtime.toISOString(),
          });
        } catch {
          // Removed between readdir and stat: simply not listed.
        }
      }

      return salidas.sort((left, right) => right.ts.localeCompare(left.ts));
    },

    async obtenerSalida(projectId, id) {
      const projectRoot = await resolveProjectRoot(projectId);
      const resolvedPath = resolveSalidaPath(projectRoot, id);

      const tipo = tipoDeSalida(id);
      if (!tipo) {
        throw createSalidaError('Output type not allowed', 400, 'SALIDA_TYPE_NOT_ALLOWED');
      }

      let stats;
      try {
        stats = await dependencies.fileSystem.stat(resolvedPath);
      } catch {
        throw createSalidaError('Output not found', 404, 'SALIDA_NOT_FOUND');
      }

      if (!stats.isFile()) {
        throw createSalidaError('Output not found', 404, 'SALIDA_NOT_FOUND');
      }

      if (stats.size > MAXIMUM_SALIDA_BYTES) {
        throw createSalidaError('Output exceeds the 25 MB limit', 413, 'SALIDA_TOO_LARGE');
      }

      return {
        tipo: tipo.tipo,
        mime: tipo.mime,
        bytes: stats.size,
        stream: dependencies.fileSystem.createReadStream(resolvedPath),
      };
    },
  };
}
