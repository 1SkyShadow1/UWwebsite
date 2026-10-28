# Glass header

The shared header uses a floating, rounded glass surface: pearl in light mode and smoked black in dark mode. The original black-and-gold logo remains intact inside an opaque brand inset; the image is up to 380 px wide on desktop and 348 px on mobile, with no transform scaling. Footer branding is unchanged.

`src/header-glass.css` owns the component styles and responsive overrides. Shared header-height variables account for the announcement, panel and gaps, keeping page content, sticky tools and anchor targets clear of the fixed header. The main panel is 116 px high on desktop and 164 px on small screens, where the logo and controls occupy two rows.

`src/features/header.js` binds per-page listeners with the page AbortSignal. It manages scroll appearance, empty/non-empty count badges, menu focus, Escape, outside dismissal and closing the disclosure when switching to desktop navigation. The existing search, saved materials, wishlist, theme and shopping controls retain their behavior. No API, credential or database changes are required.

- Navigation and icon targets remain at least 44 px. The active route uses the existing gold accent, and focus indicators work in both themes.
- The mobile disclosure is a two-column list with bounded height and scrolling for short viewports. Opening focuses the first link; Escape restores the toggle focus.
- Backdrop blur has an opaque fallback. Reduced-motion and reduced-transparency preferences remove the corresponding effects. There are no new images, font downloads or animation libraries.
- Scroll appearance updates through requestAnimationFrame. Badge updates observe text changes, and listeners/observers are released when the page is replaced.

## Verification, 28 October 2026

Production build and all 95 existing tests pass. Browser layout checks covered approximately 320, 390, 700, 701, 863, 1004, 1440, 1441 and 1920 px widths: header contents fit, logo and controls do not overlap, and the page does not overflow horizontally. Both themes were visually reviewed on desktop and mobile.

Browser interaction checks covered opening and closing navigation, first-link focus, Escape focus restoration, tapping outside the disclosure, desktop resize, searching for velvet, saving a swatch, restoring its badge and drawer after reload, and opening the shopping drawer. These checks used the temporary local PostgreSQL QA server with dummy provider credentials; no paid AI operation was requested.
