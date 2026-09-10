import { Bell, BellOff, BellRing, Loader2, Play, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';
import { playChatCompletionSound } from '@/shared/utils';
import type { NotificationPreferencesState } from '@/shared/types';

type NotificationsSettingsTabProps = {
  notificationPreferences: NotificationPreferencesState;
  onNotificationPreferencesChange: (value: NotificationPreferencesState) => void;
  pushPermission: NotificationPermission | 'unsupported';
  isPushSubscribed: boolean;
  isPushLoading: boolean;
  onEnablePush: () => void;
  onDisablePush: () => void;
  isDesktop?: boolean;
  desktopNotifications?: {
    enabled: boolean;
    supported: boolean;
    connectedCount?: number;
    targetCount?: number;
    lastError?: string | null;
  } | null;
  onEnableDesktopNotifications?: () => void;
  onDisableDesktopNotifications?: () => void;
  /** Live state of this browser's notification channel; absent outside the web app. */
  browserNotifications?: {
    isSupported: boolean;
    permission: NotificationPermission;
    isConnected: boolean;
    requestPermission: () => Promise<NotificationPermission>;
    showTestNotification: () => void;
  } | null;
};

/** Rendered by Settings for the "notifications" tab, covering notification channels and events. */
export default function NotificationsSettingsTab({
  notificationPreferences,
  onNotificationPreferencesChange,
  pushPermission,
  isPushSubscribed,
  isPushLoading,
  onEnablePush,
  onDisablePush,
  isDesktop = false,
  desktopNotifications = null,
  onEnableDesktopNotifications,
  onDisableDesktopNotifications,
  browserNotifications = null,
}: NotificationsSettingsTabProps) {
  const { t } = useTranslation('settings');

  const pushSupported = pushPermission !== 'unsupported';
  const pushDenied = pushPermission === 'denied';

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-foreground">{t('notifications.title')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{t('notifications.description')}</p>
      </div>

      {isDesktop ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h4 className="font-medium text-foreground">
            {t('notifications.desktop.title', { defaultValue: 'Notify this desktop app' })}
          </h4>
          {desktopNotifications?.supported === false ? (
            <p className="text-sm text-muted-foreground">
              {t('notifications.desktop.unsupported', { defaultValue: 'Desktop notifications are not supported on this system.' })}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (desktopNotifications?.enabled) {
                      onDisableDesktopNotifications?.();
                    } else {
                      onEnableDesktopNotifications?.();
                    }
                  }}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    desktopNotifications?.enabled
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                      : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                  }`}
                >
                  {desktopNotifications?.enabled ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <BellRing className="h-4 w-4" />
                  )}
                  {desktopNotifications?.enabled
                    ? t('notifications.desktop.disable', { defaultValue: 'Disable desktop notifications' })
                    : t('notifications.desktop.enable', { defaultValue: 'Enable desktop notifications' })}
                </button>
                {desktopNotifications?.enabled && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    {t('notifications.desktop.enabled', { defaultValue: 'Desktop notifications are enabled' })}
                  </span>
                )}
              </div>
              {desktopNotifications?.lastError && (
                <p className="text-sm text-red-600 dark:text-red-400">{desktopNotifications.lastError}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h4 className="font-medium text-foreground">{t('notifications.webPush.title')}</h4>
          {!pushSupported ? (
            <p className="text-sm text-muted-foreground">{t('notifications.webPush.unsupported')}</p>
          ) : pushDenied ? (
            <p className="text-sm text-muted-foreground">{t('notifications.webPush.denied')}</p>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isPushLoading}
                onClick={() => {
                  if (isPushSubscribed) {
                    onDisablePush();
                  } else {
                    onEnablePush();
                  }
                }}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isPushSubscribed
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                    : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                }`}
              >
                {isPushLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPushSubscribed ? (
                  <BellOff className="h-4 w-4" />
                ) : (
                  <BellRing className="h-4 w-4" />
                )}
                {isPushLoading
                  ? t('notifications.webPush.loading')
                  : isPushSubscribed
                    ? t('notifications.webPush.disable')
                    : t('notifications.webPush.enable')}
              </button>
              {isPushSubscribed && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  {t('notifications.webPush.enabled')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notificaciones del navegador. Se separan de Web Push a propósito: son
          instantáneas y no salen del tailnet, pero necesitan la pestaña viva.
          Las tres condiciones se muestran juntas porque fallar una sola deja
          todo en silencio, y desde afuera las tres se ven igual. */}
      {!isDesktop && browserNotifications?.isSupported && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-foreground">
                {t('notifications.browser.title', { defaultValue: 'Avisos en este navegador' })}
              </h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('notifications.browser.description', {
                defaultValue: 'Muestra un aviso del sistema cuando termina una ejecución. Necesita esta pestaña abierta.',
              })}
            </p>
          </div>

          {browserNotifications.permission === 'denied' ? (
            <p className="text-sm text-muted-foreground">
              {t('notifications.browser.denied', {
                defaultValue: 'El navegador bloqueó los avisos para este sitio. Hay que volver a permitirlos desde la barra de direcciones.',
              })}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {browserNotifications.permission !== 'granted' && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void browserNotifications.requestPermission();
                  }}
                >
                  <BellRing className="h-4 w-4" />
                  {t('notifications.browser.grant', { defaultValue: 'Permitir avisos' })}
                </Button>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={notificationPreferences.channels.desktop}
                  onChange={(event) =>
                    onNotificationPreferencesChange({
                      ...notificationPreferences,
                      channels: {
                        ...notificationPreferences.channels,
                        desktop: event.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4"
                />
                {t('notifications.browser.channelEnabled', { defaultValue: 'Enviar avisos a este navegador' })}
              </label>

              {browserNotifications.permission === 'granted' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={browserNotifications.showTestNotification}
                >
                  <Play className="h-4 w-4" />
                  {t('notifications.browser.test', { defaultValue: 'Probar aviso' })}
                </Button>
              )}
            </div>
          )}

          {browserNotifications.permission === 'granted' && (
            <p className="text-sm text-muted-foreground">
              {browserNotifications.isConnected
                ? t('notifications.browser.connected', { defaultValue: 'Conectado y esperando avisos.' })
                : t('notifications.browser.connecting', { defaultValue: 'Conectando…' })}
            </p>
          )}

          {browserNotifications.permission === 'granted' && !notificationPreferences.channels.desktop && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t('notifications.browser.channelOff', {
                defaultValue: 'Los avisos están permitidos, pero el envío a este navegador está apagado: no va a llegar ninguno.',
              })}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-foreground">
                {t('notifications.sound.title', { defaultValue: 'Sound' })}
              </h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('notifications.sound.description', {
                defaultValue: 'Play a short tone when a chat run finishes.',
              })}
            </p>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.channels.sound}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  channels: {
                    ...notificationPreferences.channels,
                    sound: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.sound.enabled', { defaultValue: 'Enabled' })}
          </label>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void playChatCompletionSound({ force: true });
          }}
        >
          <Play className="h-4 w-4" />
          {t('notifications.sound.test', { defaultValue: 'Test sound' })}
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h4 className="font-medium text-foreground">{t('notifications.events.title')}</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.actionRequired}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    actionRequired: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.actionRequired')}
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.stop}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    stop: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.stop')}
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={notificationPreferences.events.error}
              onChange={(event) =>
                onNotificationPreferencesChange({
                  ...notificationPreferences,
                  events: {
                    ...notificationPreferences.events,
                    error: event.target.checked,
                  },
                })
              }
              className="h-4 w-4"
            />
            {t('notifications.events.error')}
          </label>
        </div>
      </div>
    </div>
  );
}
