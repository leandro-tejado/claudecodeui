/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Única familia (design-system/typography.md): nada de serif en el chat.
        sans: ['"Encode Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        // Mono del design system: rutas de archivo, ids, código inline.
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Code"', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /*
         * Design system aprobado (Fase 10, Optimum + Apple): design-system/tokens.md
         * y design-system/branding.md. Van bajo el prefijo `ds` a propósito, NO
         * pisando `primary`/`secondary`/`muted`/etc de shadcn: esos ya los usa toda
         * la app (paso 1 de la Fase 11 no cambia el aspecto, solo saca la tipografía
         * serif). Las fases 2-6 consumen estas clases (`text-ds-ink`, `bg-ds-surface-2`,
         * `text-ds-signal-bad`, ...) al implementar cada componente.
         */
        ds: {
          ink: "var(--ds-ink)",
          muted: "var(--ds-muted)",
          faint: "var(--ds-faint)",
          surface: {
            DEFAULT: "var(--ds-surface)",
            2: "var(--ds-surface-2)",
            3: "var(--ds-surface-3)",
          },
          line: {
            DEFAULT: "var(--ds-line)",
            strong: "var(--ds-line-strong)",
          },
          primary: {
            DEFAULT: "var(--ds-primary)",
            light: "var(--ds-primary-light)",
            dark: "var(--ds-primary-dark)",
            tint: "var(--ds-primary-tint)",
          },
          secondary: {
            DEFAULT: "var(--ds-secondary)",
            tint: "var(--ds-secondary-tint)",
          },
          signal: {
            good: "var(--ds-signal-good)",
            warn: "var(--ds-signal-warn)",
            bad: "var(--ds-signal-bad)",
          },
        },
      },
      fontSize: {
        // Escala de design-system/typography.md, bajo `ds` para no tocar la
        // escala por defecto de Tailwind (`text-xs`/`text-sm` ya en uso).
        'ds-label': ['11.5px', { lineHeight: '1.3', letterSpacing: '0.07em', fontWeight: '700' }],
        'ds-xs': ['12px', { lineHeight: '1.4', letterSpacing: '0' }],
        'ds-compact': ['13px', { lineHeight: '1.5', letterSpacing: '0' }],
        'ds-sm': ['14px', { lineHeight: '1.5', letterSpacing: '0' }],
        'ds-body': ['15px', { lineHeight: '1.75', letterSpacing: '0' }],
        'ds-h4': ['14.5px', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],
        'ds-h3': ['16px', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '700' }],
        'ds-h2': ['17px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        'ds-display': ['clamp(22px, 4vw, 28px)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // design-system/tokens.md — valores concretos, separados del `--radius`
        // que ya gobierna `rounded-sm/md/lg` en toda la app.
        'ds-sm': '6px',
        'ds-md': '8px',
        'ds-lg': '12px',
      },
      boxShadow: {
        // design-system/tokens.md. `shadow-ds-card` sigue el tema por la
        // variable `--ds-shadow-card` (redefinida en `.dark`); los otros dos no
        // tienen variante oscura propia en el token doc.
        'ds-card': 'var(--ds-shadow-card)',
        'ds-card-hover': '0 4px 12px rgb(20 33 61 / 0.10)',
        'ds-float': '0 8px 24px rgb(20 33 61 / 0.14)',
      },
      zIndex: {
        // design-system/tokens.md — capas del rediseño del chat.
        'ds-base': '0',
        'ds-sidebar': '10',
        'ds-header': '20',
        'ds-activity': '25',
        'ds-dropdown': '30',
        'ds-popover': '40',
        'ds-modal': '50',
        'ds-toast': '60',
      },
      screens: {
        // design-system/tokens.md — nombres propios para no pisar sm/md/lg/xl/2xl.
        // `ds-movil` y `ds-wide` son los anchos que usa el arnés E2E
        // (VIEWPORTS.movil y VIEWPORTS.escritorio en e2e/lib/navegador.mjs).
        'ds-movil': '390px',
        'ds-tablet': '768px',
        'ds-desktop': '1024px',
        'ds-wide': '1280px',
        'ds-wide-plus': '1440px',
      },
      spacing: {
        'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
        'mobile-nav': 'var(--mobile-nav-total)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'dialog-overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'dialog-content-show': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.96)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'bottom-sheet-content-show': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Las carpetas del árbol (TreeMotion.tsx).
        'tree-root-in': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'tree-item-in': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'dialog-overlay-show': 'dialog-overlay-show 150ms ease-out',
        'dialog-content-show': 'dialog-content-show 150ms ease-out',
        'bottom-sheet-content-show': 'bottom-sheet-content-show 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'tree-root-in': 'tree-root-in 400ms ease-out both',
        'tree-item-in': 'tree-item-in 200ms ease-out both',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
