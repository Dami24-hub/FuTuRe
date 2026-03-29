# Accessibility (a11y)

## Standards

WCAG 2.1 AA compliance target.

## What's implemented

### Landmarks & structure
- `<header>`, `<main id="main-content">`, `<section>` with `aria-labelledby` throughout `App.jsx`
- `<h1>` → `<h2>` heading hierarchy (screen-reader-only `<h2>` where visual heading isn't needed)

### Skip navigation
- "Skip to main content" link at the top of the page — visible on focus, hidden otherwise (`.skip-link` in `index.css`)

### ARIA
- All interactive elements have `aria-label` or associated `<label>`
- Form inputs use `aria-invalid` + `aria-describedby` pointing to inline error messages
- Buttons use `aria-busy` during async operations
- Disclosure buttons use `aria-expanded` + `aria-controls`
- Modals use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Decorative icons marked `aria-hidden="true"`
- Status messages use `role="alert"` / `aria-live="polite"` / `aria-live="assertive"` as appropriate
- Global loading state announced via a hidden `aria-live="polite"` region

### Focus management
- `useFocusTrap` hook (`src/hooks/useFocusTrap.js`) traps focus inside modals (QRCodeModal, TxModal)
- Focus returns to the triggering element when a modal closes
- `Escape` closes all modals

### Keyboard navigation
- All interactive elements reachable by `Tab`
- Transaction rows are `role="button"` with `tabIndex={0}` and respond to `Enter`/`Space`
- Global shortcuts: `Ctrl+N` (create account), `Escape` (close modals), `?` (shortcuts help)

### Screen reader support
- `.sr-only` utility class for visually hidden but announced text
- `<time dateTime="…">` for message timestamps
- `role="list"` / `role="listitem"` on balance and transaction lists
- `role="log"` on message history panel
- `role="status"` on PWA banners and WebSocket indicator

### Color contrast
- CSS custom properties (`--text`, `--primary`, `--danger`, `--success`) maintain ≥ 4.5:1 contrast ratio in both light and dark themes
- Focus ring: `outline: 3px solid var(--primary)` via `:focus-visible`

## Testing

### Manual
1. Tab through the entire app — every interactive element must be reachable and have a visible focus ring
2. Activate all buttons/links with `Enter` and `Space`
3. Open QR modal and transaction detail modal — confirm focus is trapped and returns on close
4. Test with a screen reader (NVDA/JAWS on Windows, VoiceOver on macOS/iOS)

### Automated
The existing `frontend/tests/accessibility.test.jsx` uses `@testing-library/jest-dom` assertions.
Run with:
```bash
cd frontend && npm test
```

To add axe-core automated checks, install `@axe-core/react` and add to `src/setupTests.js`:
```js
import { configureAxe } from '@axe-core/react';
configureAxe(React, ReactDOM);
```
