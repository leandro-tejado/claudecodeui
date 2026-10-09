import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ChatComposer from '@/modules/chat/composer/ChatComposer';

/*
 * Rediseño 09-oct, Fase 4: el compositor es una píldora con cuatro controles
 * —adjuntar, anillo de contexto, el menú único del turno y enviar—. Modelo,
 * esfuerzo, cuenta y permisos viven plegados dentro de ese menú.
 */

vi.mock('@/modules/chat/hooks/useVoiceAvailable', () => ({ useVoiceAvailable: () => false }));
vi.mock('@/modules/skin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  SkinContextMeterBridge: () => <button type="button" aria-label="Contexto de la sesión">◔</button>,
}));
vi.mock('@/modules/cuentas', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCuentas: () => ({ cuentas: [], nuevaCuenta: 'optimum' }),
  CuotaCuenta: () => null,
}));

const noop = () => {};
const props = (extra: Record<string, unknown> = {}) => ({
  pendingPermissionRequests: [],
  handlePermissionDecision: noop,
  handleGrantToolPermission: () => ({ success: true }),
  activity: null,
  isLoading: false,
  onAbortSession: noop,
  permissionMode: 'default' as const,
  availablePermissionModes: ['default', 'acceptEdits', 'plan'] as never,
  onSelectPermissionMode: vi.fn(),
  providerLabel: 'Claude',
  effort: 'high',
  availableEffortOptions: [{ value: 'low' }, { value: 'high' }] as never,
  onSelectEffort: noop,
  model: 'opus',
  availableModelOptions: [{ value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }] as never,
  onSelectModel: noop,
  modelsLoading: false,
  tokenBudget: null,
  onShowTokenUsage: noop,
  slashCommandsCount: 3,
  onToggleCommandMenu: noop,
  hasInput: false,
  onClearInput: noop,
  onSubmit: noop,
  isDragActive: false,
  queuedDraft: null,
  isEditingSentMessage: false,
  onCancelEditMessage: noop,
  scheduledMessages: [],
  onScheduleMessage: noop,
  onCancelScheduledMessage: noop,
  onEditQueuedDraft: noop,
  onDeleteQueuedDraft: noop,
  attachedFiles: [],
  onRemoveAttachment: noop,
  fileErrors: new Map(),
  showFileDropdown: false,
  filteredFiles: [],
  selectedFileIndex: -1,
  onSelectFile: noop,
  filteredCommands: [],
  selectedCommandIndex: -1,
  onCommandSelect: noop,
  onCloseCommandMenu: noop,
  isCommandMenuOpen: false,
  frequentCommands: [],
  getRootProps: () => ({}),
  getInputProps: () => ({ type: 'file' }),
  openAttachmentPicker: noop,
  inputHighlightRef: createRef<HTMLDivElement>(),
  renderInputWithMentions: (text: string) => text,
  textareaRef: createRef<HTMLTextAreaElement>(),
  input: '',
  onInputChange: noop,
  onTextareaClick: noop,
  onTextareaKeyDown: noop,
  onTextareaPaste: noop,
  onTextareaScrollSync: noop,
  onTextareaInput: noop,
  placeholder: 'Escribe…',
  isTextareaExpanded: false,
  cuenta: { puedeElegir: true, cuenta: 'optimum' },
  ...extra,
});

const controlesDelPie = () => {
  const form = document.querySelector('form') as HTMLElement;
  return within(form).getAllByRole('button');
};

describe('compositor del rediseño 09-oct', () => {
  it('vacío muestra a lo sumo cuatro controles', () => {
    render(<ChatComposer {...(props() as unknown as Parameters<typeof ChatComposer>[0])} />);
    const botones = controlesDelPie();
    expect(botones.length).toBeLessThanOrEqual(4);
    expect(screen.queryByRole('button', { name: /permis|approved|aprobar/i })).toBeNull();
  });

  it('el menú único lleva el modelo y el esfuerzo en el trigger y pliega cuenta y permisos', () => {
    const onSelectPermissionMode = vi.fn();
    render(<ChatComposer {...(props({ onSelectPermissionMode }) as unknown as Parameters<typeof ChatComposer>[0])} />);
    const trigger = screen.getByRole('button', { name: /^Opus · high/ });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Cuenta')).toBeTruthy();
    expect(within(menu).getByText('Opus')).toBeTruthy();
    const plan = within(menu).getAllByRole('menuitemradio').find((item) => /plan/i.test(item.textContent ?? ''));
    expect(plan).toBeTruthy();
    fireEvent.click(plan as HTMLElement);
    expect(onSelectPermissionMode).toHaveBeenCalledWith('plan');
  });

  it('el placeholder es corto', () => {
    render(<ChatComposer {...(props() as unknown as Parameters<typeof ChatComposer>[0])} />);
    expect(screen.getByPlaceholderText('Escribe…')).toBeTruthy();
  });
});

describe('a dónde va el mensaje (Fase 7)', () => {
  it('sin sesión dice «Sesión nueva en <proyecto> · <cuenta>» con la ruta en el title', () => {
    render(
      <ChatComposer
        {...(props({ destino: { proyecto: 'optimum', ruta: '/home/x/clientes/optimum', cuenta: 'Optimum' } }) as unknown as Parameters<typeof ChatComposer>[0])}
      />,
    );
    const linea = screen.getByTestId('destino-mensaje');
    expect(linea.textContent).toBe('Sesión nueva en optimum · Optimum');
    expect(linea.getAttribute('title')).toBe('/home/x/clientes/optimum');
  });

  it('con sesión abierta no hay línea', () => {
    render(<ChatComposer {...(props({ destino: null }) as unknown as Parameters<typeof ChatComposer>[0])} />);
    expect(screen.queryByTestId('destino-mensaje')).toBeNull();
  });
});
