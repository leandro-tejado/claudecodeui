import { useTranslation } from 'react-i18next';

/**
 * Shown by the auth module's ProtectedRoute while the initial auth status check
 * is in flight.
 *
 * It used to be the upstream splash: a logo in a blue tile, the upstream
 * wordmark under it, three dots bouncing. All of it appeared on every reload of
 * an app that is called LT Space, and none of it told the user anything — the
 * check it covers is a single request. What is left is the wordmark on the
 * theme's own background, which reads as the page settling, not as a screen.
 *
 * The SVG is monochrome and inherits `currentColor` on purpose: the source
 * artwork is a JPEG on cream, which in dark mode would float as a pale slab.
 */
export default function AuthLoadingScreen() {
  const { t } = useTranslation('auth');
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center text-foreground" role="status" aria-live="polite">
        <img src="/lt-wordmark.svg" alt="LT Space" className="mx-auto w-32 opacity-90" />
        {/* The only part a screen reader needs: dropping it would trade a
            branded animation for an accessibility regression. */}
        <p className="sr-only">{t('misc.loadingState')}</p>
      </div>
    </div>
  );
}
