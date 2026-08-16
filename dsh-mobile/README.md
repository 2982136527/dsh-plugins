# dsh-mobile

Mobile viewport optimization for the DeepSeek Harness web UI (`dsh web`).

## What it fixes on phones / narrow windows (≤ 720px)

| Problem | Fix |
|---|---|
| Chat column squeezed by the 3-column grid | Frame becomes a **full-width** chat column |
| Sidebar rail wastes 56px and the expanded sidebar squeezes the chat | The rail is hidden entirely; a **32px menu button docked in the header top-left** opens the sidebar as a left drawer (tap outside / Escape closes) |
| Header utility buttons (Session log / constraint files) have mismatched heights | Aligned to 32px on narrow viewports |
| Composer controls overlap on phones (Commands / Access mode / Attach files stack onto the model select) | The control row wraps into **two rows**: tools left, model select / context meter / send right |
| Commands / Attach buttons buried in the left tools cluster | Both move onto the **model select row** (same row: commands, attach, model select, context, send) |
| Access-mode button clutters the composer row | It moves **inside the model dropdown** as a `权限 / Access` row under the Effort row (opens the app's own permission menu) |
| The details panel eats the chat column | It becomes a **right drawer**, parked off-screen while closed |
| Details can't open at all on phones (the concession solver forces its track to 0 below ~996px) | The plugin mirrors tool-call selection onto its own attribute and slides the drawer in; the hover-only Inspect pill is always visible on touch |
| Tool-detail sliver bleeding at the right edge on narrow screens | Closed details column is fully off-screen (fixed + translated) |
| iOS home indicator / notch overlaps the composer | `viewport-fit=cover` meta + `env(safe-area-inset-bottom)` padding on the frame and drawers; `100dvh` height tracking |
| Context-injection chips clipped at the screen edge | Source chips shrink with ellipsis |
| Tiny 28–36px icon buttons | Icon-only buttons grow to 44×44 on coarse pointers |
| No pressed feedback on touch | `button:active` dim + transparent tap highlight |

## Layout

- `lib/index.js` — host half: a no-op entry so the package is a loader row.
- `lib/client.js` — browser half: hand-written client bundle (the
  `window.__ModuleLoader__.load` wire format; no build step needed).
## Install

From the dsh profile (the file list below is for the `web` profile):

```bash
cd ~/.dsh/profiles/web
pnpm add link:/path/to/dsh-mobile
```

Then append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-mobile
      name: dsh-mobile
```

The profile patch layer is hot-reloaded (watch-only HMR), so the plugin mounts
on the running server without a restart; refresh the browser tab to pick up
the new boot graph.

## Notes

- Drawer open/close rides the app's own state (`data-sidebar-collapsed` /
  `data-details-collapsed` on the frame), so nothing here fights React.
- The rail (New Session / workspace icons / Settings) stays in-flow at 56px —
  the expanded drawer is what overlays.
- Everything is scoped to `max-width: 720px`; desktop is untouched.

## Install from GitHub

```bash
cd ~/.dsh/profiles/web
pnpm add git+https://github.com/2982136527/dsh-mobile.git
```

Then append to `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-mobile
      name: dsh-mobile
```
