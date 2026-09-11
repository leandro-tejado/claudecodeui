import { useTranslation } from 'react-i18next';

import { ThemePreferenceSelect } from '@/shared/ui';
import type { CodeEditorSettingsState, ProjectSortOrder } from '@/shared/types';
import { LanguageSelector } from '@/modules/i18n';
import { useSetUiPreference, useUiPreferences } from '@/shared/context/UiPreferencesContext';
import SettingsCard from '@/modules/settings/SettingsCard';
import SettingsRow from '@/modules/settings/SettingsRow';
import SettingsSection from '@/modules/settings/SettingsSection';
import SettingsToggle from '@/modules/settings/SettingsToggle';

type AppearanceSettingsTabProps = {
  projectSortOrder: ProjectSortOrder;
  onProjectSortOrderChange: (value: ProjectSortOrder) => void;
  codeEditorSettings: CodeEditorSettingsState;
  onCodeEditorWordWrapChange: (value: boolean) => void;
  onCodeEditorShowMinimapChange: (value: boolean) => void;
  onCodeEditorLineNumbersChange: (value: boolean) => void;
  onCodeEditorFontSizeChange: (value: string) => void;
};

/** Rendered by Settings for the "appearance" tab, covering theme, project sorting and code editor preferences. */
export default function AppearanceSettingsTab({
  projectSortOrder,
  onProjectSortOrderChange,
  codeEditorSettings,
  onCodeEditorWordWrapChange,
  onCodeEditorShowMinimapChange,
  onCodeEditorLineNumbersChange,
  onCodeEditorFontSizeChange,
}: AppearanceSettingsTabProps) {
  const { t } = useTranslation('settings');
  const uiPreferences = useUiPreferences();
  const setUiPreference = useSetUiPreference();

  return (
    <div className="space-y-8">
      <SettingsSection title={t('appearanceSettings.theme.label', { defaultValue: 'Tema' })}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.theme.label', { defaultValue: 'Tema' })}
            description={t('appearanceSettings.theme.description', {
              defaultValue: 'Elegí el tema claro, el oscuro, o seguí el del sistema.',
            })}
          >
            <ThemePreferenceSelect ariaLabel={t('appearanceSettings.theme.label', { defaultValue: 'Tema' })} />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('mainTabs.appearance')}>
        <SettingsCard>
          <LanguageSelector />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.projectSorting.label')}>
        <SettingsCard>
          <SettingsRow
            label={t('appearanceSettings.projectSorting.label')}
            description={t('appearanceSettings.projectSorting.description')}
          >
            <select
              value={projectSortOrder}
              onChange={(event) => onProjectSortOrderChange(event.target.value as ProjectSortOrder)}
              className="w-full touch-manipulation rounded-lg border border-input bg-card p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:w-36"
            >
              <option value="name">{t('appearanceSettings.projectSorting.alphabetical')}</option>
              <option value="date">{t('appearanceSettings.projectSorting.recentActivity')}</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('appearanceSettings.codeEditor.title')}>
        <SettingsCard divided>
          <SettingsRow
            label={t('appearanceSettings.codeEditor.wordWrap.label')}
            description={t('appearanceSettings.codeEditor.wordWrap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.wordWrap}
              onChange={onCodeEditorWordWrapChange}
              ariaLabel={t('appearanceSettings.codeEditor.wordWrap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.showMinimap.label')}
            description={t('appearanceSettings.codeEditor.showMinimap.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.showMinimap}
              onChange={onCodeEditorShowMinimapChange}
              ariaLabel={t('appearanceSettings.codeEditor.showMinimap.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.lineNumbers.label')}
            description={t('appearanceSettings.codeEditor.lineNumbers.description')}
          >
            <SettingsToggle
              checked={codeEditorSettings.lineNumbers}
              onChange={onCodeEditorLineNumbersChange}
              ariaLabel={t('appearanceSettings.codeEditor.lineNumbers.label')}
            />
          </SettingsRow>

          <SettingsRow
            label={t('appearanceSettings.codeEditor.fontSize.label')}
            description={t('appearanceSettings.codeEditor.fontSize.description')}
          >
            <select
              value={codeEditorSettings.fontSize}
              onChange={(event) => onCodeEditorFontSizeChange(event.target.value)}
              className="w-full touch-manipulation rounded-lg border border-input bg-card p-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:w-28"
            >
              <option value="10">10px</option>
              <option value="11">11px</option>
              <option value="12">12px</option>
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="15">15px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
            </select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {/* Estos tres vivían en el cajón de Ajustes rápidos, que se retiró para
          dejarle el borde derecho al panel de archivos. Eran los únicos
          controles que ese cajón tenía y no existen en ninguna otra pantalla:
          si se iban con él, se perdía el control de "Mostrar razonamiento". */}
      <SettingsSection title="Chat">
        <SettingsCard>
          <SettingsRow
            label="Mostrar razonamiento"
            description="Muestra el bloque de pensamiento del modelo dentro de la respuesta."
          >
            <SettingsToggle
              checked={uiPreferences.showThinking}
              onChange={(value) => setUiPreference('showThinking', value)}
              ariaLabel="Mostrar razonamiento"
            />
          </SettingsRow>

          <SettingsRow
            label="Mostrar parámetros sin procesar"
            description="Muestra los argumentos crudos con los que se llamó a cada herramienta."
          >
            <SettingsToggle
              checked={uiPreferences.showRawParameters}
              onChange={(value) => setUiPreference('showRawParameters', value)}
              ariaLabel="Mostrar parámetros sin procesar"
            />
          </SettingsRow>

          <SettingsRow
            label="Enviar con Ctrl+Enter"
            description="Con esto activado, Enter hace un salto de línea y Ctrl+Enter manda el mensaje."
          >
            <SettingsToggle
              checked={uiPreferences.sendByCtrlEnter}
              onChange={(value) => setUiPreference('sendByCtrlEnter', value)}
              ariaLabel="Enviar con Ctrl+Enter"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
