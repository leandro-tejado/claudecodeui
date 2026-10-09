import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { PermissionMode, ProviderModelOption } from '@/shared/types';
import { AccountChip } from '@/modules/cuentas';
import { CuentaMenuItems } from '@/modules/chat/composer/ComposerCuentaMenu';
import { PermissionMenuItems, PermissionModeIcon } from '@/modules/chat/composer/ComposerPermissionMenu';
import { DEFAULT_EFFORT_VALUE } from '@/shared/constants';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSeparator,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

type EffortOption = NonNullable<ProviderModelOption['effort']>['values'][number];

type ComposerModelMenuProps = {
  effort: string;
  /** Effort values the active provider/model actually accepts; empty hides the section. */
  effortOptions: EffortOption[];
  onSelectEffort: (effort: string) => void;
  model: string;
  /** Model catalog for the active provider; empty hides the section. */
  modelOptions: ProviderModelOption[];
  onSelectModel: (model: string) => void;
  modelsLoading: boolean;
  /**
   * La cuenta del turno: con sesión nueva se elige acá adentro, con una ya
   * creada solo se muestra la letra en el trigger. Sin esto, no hay cuenta.
   */
  cuenta?: { puedeElegir: boolean; cuenta: string };
  /** Los permisos, plegados en el mismo menú (rediseño 09-oct). */
  permission?: {
    permissionMode: PermissionMode;
    permissionModes: PermissionMode[];
    onSelectPermissionMode: (mode: PermissionMode) => void;
    providerLabel: string;
  };
};

/**
 * Rendered by chat's ChatComposer as the popover for choosing the active
 * provider's model and reasoning effort for the next turn.
 */
function ComposerModelMenu({
  effort,
  effortOptions,
  onSelectEffort,
  model,
  modelOptions,
  onSelectModel,
  modelsLoading,
  cuenta,
  permission,
}: ComposerModelMenuProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [isModelSectionOpen, setIsModelSectionOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close);

  // The model list starts collapsed every time the menu opens, the way Codex
  // shows reasoning first and keeps the longer model list one click away.
  useEffect(() => {
    if (!isOpen) {
      setIsModelSectionOpen(false);
    }
  }, [isOpen]);

  const defaultEffortLabel = t('composer.effortDefault', { defaultValue: 'Default' });
  const resolvedEffortOptions = useMemo<EffortOption[]>(
    () => (effortOptions.length > 0 ? [{ value: DEFAULT_EFFORT_VALUE }, ...effortOptions] : []),
    [effortOptions],
  );
  const effortLabel = effort === DEFAULT_EFFORT_VALUE ? defaultEffortLabel : effort;

  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.value === model) ?? null,
    [model, modelOptions],
  );
  const modelLabel = selectedModelOption?.label || model;

  const hasEffortSection = resolvedEffortOptions.length > 0;
  const hasModelSection = modelOptions.length > 0 || modelsLoading;
  const hasPermissionSection = Boolean(permission && permission.permissionModes.length > 0);
  const hasCuentaSection = Boolean(cuenta?.puedeElegir);
  if (!hasEffortSection && !hasModelSection && !hasPermissionSection && !cuenta) {
    return null;
  }

  const triggerLabel = hasModelSection ? modelLabel : effortLabel;
  const ariaLabel = t('composer.modelMenu', {
    defaultValue: 'Select model and reasoning effort',
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className="flex h-8 max-w-32 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:max-w-56"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${triggerLabel}${hasModelSection && hasEffortSection ? ` · ${effortLabel}` : ''} · ${ariaLabel}`}
        title={ariaLabel}
      >
        {cuenta && <AccountChip cuenta={cuenta.cuenta} size="md" className="bg-transparent px-0" />}
        {permission && permission.permissionMode !== 'default' && (
          <PermissionModeIcon mode={permission.permissionMode} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{triggerLabel}</span>
        {/* El nivel se muestra siempre, incluido el default. Ocultarlo cuando
            valia `default` hacia que el control mas caro de la app fuera
            invisible justo en su estado inicial: no habia forma de saber, sin
            abrir el menu, que el razonamiento era configurable. */}
        {hasModelSection && hasEffortSection && (
          <span className="hidden shrink-0 capitalize text-muted-foreground sm:inline">· {effortLabel}</span>
        )}
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={ariaLabel}>
          {hasCuentaSection && cuenta && (
            <>
              <CuentaMenuItems cuenta={cuenta.cuenta} onElegida={() => setIsOpen(false)} />
              {(hasEffortSection || hasModelSection) && <ComposerMenuSeparator />}
            </>
          )}
          {hasEffortSection && (
            <>
              <ComposerMenuHeading>
                {t('composer.reasoning', { defaultValue: 'Reasoning' })}
              </ComposerMenuHeading>
              {resolvedEffortOptions.map((option) => (
                <ComposerMenuItem
                  key={option.value}
                  label={option.value === DEFAULT_EFFORT_VALUE ? defaultEffortLabel : option.value}
                  description={option.description}
                  isSelected={option.value === effort}
                  onSelect={() => {
                    onSelectEffort(option.value);
                    setIsOpen(false);
                  }}
                  className="capitalize"
                />
              ))}
            </>
          )}

          {hasModelSection && (
            <>
              {hasEffortSection && <ComposerMenuSeparator />}
              <ComposerMenuItem
                role="menuitem"
                label={modelLabel}
                isSelected={false}
                onSelect={() => setIsModelSectionOpen((current) => !current)}
                trailing={
                  isModelSectionOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                }
                className="text-muted-foreground"
              />

              {isModelSectionOpen && (
                <>
                  <ComposerMenuHeading>
                    {t('composer.model', { defaultValue: 'Model' })}
                  </ComposerMenuHeading>
                  {modelOptions.length === 0 && modelsLoading && (
                    <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
                      {t('composer.loadingModels', { defaultValue: 'Loading models…' })}
                    </p>
                  )}
                  {modelOptions.map((option) => (
                    <ComposerMenuItem
                      key={option.value}
                      label={option.label || option.value}
                      isSelected={option.value === model}
                      onSelect={() => {
                        onSelectModel(option.value);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {hasPermissionSection && permission && (
            <>
              <ComposerMenuSeparator />
              <PermissionMenuItems
                permissionMode={permission.permissionMode}
                permissionModes={permission.permissionModes}
                onSelectPermissionMode={(mode) => {
                  permission.onSelectPermissionMode(mode);
                  setIsOpen(false);
                }}
                providerLabel={permission.providerLabel}
              />
            </>
          )}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/** Memoized: the composer re-renders on every keystroke and none of this menu's props change while typing. */
export default memo(ComposerModelMenu);
