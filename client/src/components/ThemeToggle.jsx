

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.4v1.8M10 15.8v1.8M2.4 10h1.8M15.8 10h1.8M4.6 4.6l1.3 1.3M14.1 14.1l1.3 1.3M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.1 12.3A6.4 6.4 0 0 1 7.7 3.9a6.5 6.5 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function ThemeToggle({ theme, onChange }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button type="button" className="theme-option" aria-pressed={theme === 'light'} aria-label="Light theme" onClick={() => onChange('light')}>
        <SunIcon />
        <span>Light</span>
      </button>
      <button type="button" className="theme-option" aria-pressed={theme === 'dark'} aria-label="Dark theme" onClick={() => onChange('dark')}>
        <MoonIcon />
        <span>Dark</span>
      </button>
    </div>
  );
}
