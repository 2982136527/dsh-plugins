/**
 * dsh-mobile — browser half (client bundle).
 *
 * Wire format: the bundle registers itself with the client module system via
 * window.__ModuleLoader__.load({ id, factory }); the factory returns the
 * cordis plugin exports ({ name, apply }). Pure DOM implementation — no
 * runtime imports — so the artifact is hand-maintained CJS (the same shape
 * tsdown emits for in-repo client packages).
 *
 * Behavior:
 *  - patches the viewport meta with viewport-fit=cover (safe-area insets);
 *  - injects the mobile stylesheet (see CSS below);
 *  - narrow viewports: full-width chat column; the sidebar rail is hidden
 *    and a top-left docked button opens the sidebar drawer; the details
 *    column slides in as a right drawer;
 *  - the details drawer opens off the panel's own content signal (the app's
 *    concession solver never opens the details track below ~996px);
 *  - access mode folds into the model dropdown: the in-composer trigger is
 *    hidden and a permission row is injected under the Effort row of the
 *    model menu, opening the app's own permission menu on click;
 *  - shows a tap-outside backdrop while a drawer is open and closes the
 *    drawer through the app's own controls (rail toggle / details close);
 *  - re-syncs on resize across the 720px breakpoint and on frame remount.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mobile',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var MOBILE_QUERY = '(max-width: 720px)';
    var FRAME_SELECTOR = 'div[style*="grid-template-columns"]';
    var PLUGIN_ID = 'dsh-mobile';
    var FAB_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5h12M2 8h12M2 12.5h12"/></svg>';

    var styleTag = null;
    var backdrop = null;
    var fab = null;
    var mq = null;
    var frameObserver = null;
    var applied = false;

    /** Locate the AppFrame (the three-column grid). */
    function findFrame() {
      return document.querySelector(FRAME_SELECTOR);
    }

    /** Any drawer currently open? (collapse attributes are present exactly when collapsed). */
    function drawerOpen(frame) {
      return frame !== null
        && (frame.hasAttribute('data-sidebar-collapsed') === false
          || frame.hasAttribute('data-details-collapsed') === false
          || frame.hasAttribute('data-dsh-mobile-details'));
    }

    /** Reflect drawer state on <html> for the backdrop CSS. */
    function syncBackdrop() {
      if (backdrop === null) return;
      var open = mq !== null && mq.matches && drawerOpen(findFrame());
      if (open) {
        document.documentElement.setAttribute('data-dsh-mobile-drawer', '');
      } else {
        document.documentElement.removeAttribute('data-dsh-mobile-drawer');
      }
    }

    /**
     * Find the SidebarRoot logo row (contains the expand/collapse toggle).
     * The SidebarRoot renders inside the [data-slot="sidebar"] wrapper.
     */
    function findLogoRow() {
      var frame = findFrame();
      if (frame === null) return null;
      var sidebar = frame.children[0];
      var slot = sidebar !== undefined ? sidebar.querySelector('[data-slot="sidebar"]') : undefined;
      var root = slot !== undefined ? slot.children[0] : undefined;
      return root !== undefined && root.children.length > 0 ? root.children[0] : null;
    }

    /** The expand/collapse toggle is the LAST button of the logo row. */
    function sidebarToggle() {
      var logoRow = findLogoRow();
      if (logoRow === null) return null;
      var buttons = logoRow.querySelectorAll('button');
      return buttons.length > 0 ? buttons[buttons.length - 1] : null;
    }

    function openSidebar() {
      var toggle = sidebarToggle();
      if (toggle !== null) toggle.click();
    }

    /**
     * Close open drawers through the app's own controls, so every piece of
     * React state stays consistent:
     *  - sidebar: the rail toggle (LAST button of the logo row);
     *  - details: the DetailsPanel close button is the column's first button.
     */
    function closeDrawers() {
      var frame = findFrame();
      if (frame === null) return;
      if (frame.hasAttribute('data-sidebar-collapsed') === false) {
        var toggle = sidebarToggle();
        if (toggle !== null) toggle.click();
      }
      if (frame.hasAttribute('data-details-collapsed') === false
        || frame.hasAttribute('data-dsh-mobile-details')) {
        var details = frame.children[2];
        var close = details !== undefined ? details.querySelector('button') : undefined;
        if (close !== undefined) close.click();
      }
    }

    /**
     * Open the details drawer from the panel's own content: the DetailsPanel
     * renders <pre> code sections exactly when a tool call is selected (the
     * empty state is a plain hint line), so selection is mirrored onto a
     * plugin-owned frame attribute that the CSS drawer follows.
     */
    function syncDetails() {
      var frame = findFrame();
      if (frame === null) return;
      var col = frame.children[2];
      var hasSelection = col !== undefined && col.querySelector('pre') !== null;
      if (hasSelection) frame.setAttribute('data-dsh-mobile-details', '');
      else frame.removeAttribute('data-dsh-mobile-details');
      syncBackdrop();
    }

    /** FAB visibility: shown on narrow viewports while the sidebar is collapsed. */
    function syncFab() {
      if (fab === null) return;
      var mobile = mq !== null && mq.matches;
      var frame = findFrame();
      var collapsed = frame === null || frame.hasAttribute('data-sidebar-collapsed');
      if (!mobile || !collapsed) {
        document.documentElement.removeAttribute('data-dsh-mobile-fab-show');
        return;
      }
      document.documentElement.setAttribute('data-dsh-mobile-fab-show', '');
    }

    /**
     * Access mode folds into the model dropdown on narrow viewports: when
     * the ModelSelect root pane (Model / Effort rows) opens, append a
     * permission row after the last root cell. Clicking it closes the model
     * menu through the app's own outside-close path, then opens the
     * permission menu through the (hidden) in-composer trigger — every
     * React state transition stays the app's own.
     */
    var PERM_ROW_CLASS = 'dsh-mobile-perm-row';

    function permissionTrigger() {
      return document.querySelector('[aria-label^="访问模式"], [aria-label^="Access mode"]');
    }

    function currentPermissionValue() {
      var trigger = permissionTrigger();
      if (trigger === null) return '';
      var label = trigger.getAttribute('aria-label') || '';
      var match = /当前：([^,，]+)|current:\s*([^,，]+)/.exec(label);
      return match ? (match[1] !== undefined ? match[1] : match[2]) : '';
    }

    function permissionRowLabel() {
      var lang = document.documentElement.lang || '';
      return /^zh/i.test(lang) ? '权限' : 'Access';
    }

    function isModelMenu(menu) {
      var root = menu.parentElement;
      if (root === null) return false;
      var trigger = root.querySelector('button[aria-haspopup="menu"]');
      if (trigger === null) return false;
      var label = trigger.getAttribute('aria-label') || '';
      return /model|模型/i.test(label);
    }

    function injectPermissionRow(menu) {
      if (menu.querySelector('.' + PERM_ROW_CLASS) !== null) return;
      var cells = menu.querySelectorAll('button[role="menuitem"]');
      if (cells.length === 0) return;
      var row = document.createElement('button');
      row.type = 'button';
      row.className = PERM_ROW_CLASS;
      row.setAttribute('role', 'menuitem');
      row.innerHTML = ''
        + '<span class="dsh-mobile-perm-label"></span>'
        + '<span class="dsh-mobile-perm-value"></span>'
        + '<span class="dsh-mobile-perm-chevron"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8L6 12.5"/></svg></span>';
      row.querySelector('.dsh-mobile-perm-label').textContent = permissionRowLabel();
      row.querySelector('.dsh-mobile-perm-value').textContent = currentPermissionValue();
      row.addEventListener('click', function () {
        // Close the model menu through the app's outside-close path...
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        // ...then open the permission menu through the hidden trigger.
        var trigger = permissionTrigger();
        if (trigger !== null) trigger.click();
      });
      cells[cells.length - 1].after(row);
    }

    var menuWatcher = null;
    function ensureMenuWatcher() {
      if (menuWatcher !== null) return;
      var pending = false;
      menuWatcher = new MutationObserver(function () {
        if (mq === null || !mq.matches) return;
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          relocateToolsButtons();
          var menus = document.querySelectorAll('[role="menu"]');
          for (var i = 0; i < menus.length; i++) {
            var menu = menus[i];
            if (!isModelMenu(menu)) continue;
            injectPermissionRow(menu);
            var value = menu.querySelector('.dsh-mobile-perm-value');
            if (value !== null) value.textContent = currentPermissionValue();
          }
        });
      });
      menuWatcher.observe(document.body, { childList: true, subtree: true });
    }

/**
     * The attach-files button joins the model select row: move the real
     * button (event bindings intact) from the left tools cluster into the
     * trailing cluster, in front of the model select. React updates the
     * moved node in place; a component remount (hero <-> active phase,
     * session switch) re-renders it back into the tools cluster, which the
     * body watcher below notices and re-relocates.
     */
    /**
     * The composer tools cluster (Commands + attach, plus the hidden
     * access-mode trigger) joins the model select row: every VISIBLE tool
     * button is moved into the trailing cluster — commands first, then
     * attach — right in front of the model select. The access-mode trigger
     * stays put (it is hidden and its permission menu anchors there). React
     * updates moved nodes in place; a component remount (hero <-> active
     * phase, session switch) re-renders them back into the tools cluster,
     * which the body watcher below notices and re-relocates.
     */
    function composerCluster(kind) {
      var textarea = document.querySelector('textarea');
      if (textarea === null) return null;
      var card = textarea;
      for (var i = 0; i < 8 && card !== null; i++) {
        if (String(card.className).indexOf('card') !== -1 || card.hasAttribute('data-composer-card')) break;
        card = card.parentElement;
      }
      if (card === null || card.children.length === 0) return null;
      var row = card.children[card.children.length - 1];
      if (kind === 'tools') return row.children[0];
      return row.children[row.children.length - 1];
    }

    function isAccessTrigger(button) {
      var label = button.getAttribute('aria-label') || button.getAttribute('title') || '';
      return /访问模式|Access mode|current:/i.test(label);
    }

    function relocateToolsButtons() {
      if (mq === null || !mq.matches) return;
      var trailing = composerCluster('trailing');
      if (trailing === null) return;
      var tools = composerCluster('tools');
      if (tools === null) return;
      var buttons = tools.querySelectorAll('button');
      // Pick out the visible tools: commands and attach (never the hidden
      // access-mode trigger). Their localized aria-labels match; anything
      // else that is not the access trigger also moves.
      var commands = null;
      var attach = null;
      var other = null;
      for (var i = 0; i < buttons.length; i++) {
        var label = buttons[i].getAttribute('aria-label') || buttons[i].getAttribute('title') || '';
        if (isAccessTrigger(buttons[i])) continue;
        if (/command|命令/i.test(label)) commands = buttons[i];
        else if (/attach|附件|添加文件|file/i.test(label)) attach = buttons[i];
        else other = buttons[i];
      }
      // Desired order: [commands, attach, other, model select ...]
      if (commands !== null && commands.parentElement !== trailing) {
        trailing.insertBefore(commands, trailing.firstChild);
      }
      var anchor = commands !== null && commands.parentElement === trailing ? commands : trailing.firstChild;
      var second = attach !== null ? attach : other;
      if (second !== null && second !== anchor && second.parentElement !== trailing) {
        trailing.insertBefore(second, anchor !== null ? anchor.nextSibling : trailing.firstChild);
      } else if (second !== null && second !== anchor && second.parentElement === trailing && second.previousSibling !== anchor) {
        trailing.insertBefore(second, anchor !== null ? anchor.nextSibling : trailing.firstChild);
      }
    }


    /** Keep the backdrop + FAB in sync with frame state (and find the frame when it appears). */
    function ensureFrameWatcher() {
      if (frameObserver !== null) return;
      var frame = findFrame();
      if (frame !== null) {
        frameObserver = new MutationObserver(function () {
          syncBackdrop();
          syncFab();
        });
        frameObserver.observe(frame, {
          attributes: true,
          attributeFilter: ['data-sidebar-collapsed', 'data-details-collapsed'],
        });
        var detailsCol = frame.children[2];
        if (detailsCol !== undefined) {
          new MutationObserver(syncDetails).observe(detailsCol, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        }
        syncDetails();
        syncFab();
        return;
      }
      // The frame renders after boot settles — watch for it.
      var bodyObserver = new MutationObserver(function () {
        if (findFrame() !== null) {
          bodyObserver.disconnect();
          ensureFrameWatcher();
          syncBackdrop();
          syncFab();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    /** Inject the mobile stylesheet. */
    function injectStyles() {
      if (styleTag !== null) return;
      styleTag = document.createElement('style');
      styleTag.setAttribute('data-plugin', PLUGIN_ID);
      styleTag.setAttribute('data-plugin-css', PLUGIN_ID + '/mobile');
      styleTag.textContent = "/* ============================================================\n   dsh-mobile — narrow-viewport (mobile) tuning for the DSH web UI.\n   Scoped to <= 720px: full-width chat column, hidden sidebar with a\n   top-left docked button, slide-in drawers, safe-area insets, touch\n   targets, access mode folded into the model dropdown.\n   ============================================================ */\n\n/* Dynamic viewport height: track the visible area on mobile browsers\n   whose chrome collapses (iOS/Android URL bar). */\nhtml {\n  height: 100vh;\n  -webkit-text-size-adjust: 100%;\n  text-size-adjust: 100%;\n}\n@supports (height: 100dvh) {\n  html { height: 100dvh; }\n}\nbody, #root { height: 100%; }\n\n@media (max-width: 720px) {\n  html, body { overflow-x: hidden; }\n\n  /* The three-column frame becomes a FULL-WIDTH chat column: the sidebar\n     rail is hidden entirely (the column itself becomes a drawer below) and\n     the details track is gone. The frame keeps the composer clear of the\n     iOS home indicator. */\n  div[style*=\"grid-template-columns\"] {\n    box-sizing: border-box !important;\n    grid-template-columns: minmax(0, 1fr) !important;\n    padding-bottom: env(safe-area-inset-bottom, 0px);\n  }\n\n  /* Resize handles are meaningless when the columns are drawers. */\n  div[style*=\"grid-template-columns\"] > div[style^=\"left:\"] {\n    display: none !important;\n  }\n\n  /* Sidebar column: ALWAYS a fixed left drawer; parked fully off-screen\n     while collapsed (the rail is not rendered in-flow at all), slides in\n     when the app expands it (FAB or backdrop close keep state in sync). */\n  div[style*=\"grid-template-columns\"] > div:first-child {\n    position: fixed !important;\n    top: 0;\n    bottom: 0;\n    left: 0;\n    z-index: 60;\n    width: max-content !important;\n    max-width: min(84vw, 360px) !important;\n    box-sizing: border-box !important;\n    padding-bottom: env(safe-area-inset-bottom, 0px);\n    border-right: 1px solid var(--dsw-alias-border-l1);\n    box-shadow: 16px 0 48px rgba(0, 0, 0, 0.35);\n    transform: translateX(-104%);\n    transition: transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1);\n    will-change: transform;\n  }\n  div[style*=\"grid-template-columns\"]:not([data-sidebar-collapsed]) > div:first-child {\n    transform: translateX(0);\n  }\n\n  /* Details column: always mounted at zero width on desktop; here it\n     becomes a right drawer, parked off-screen while closed. */\n  div[style*=\"grid-template-columns\"] > div:nth-child(3) {\n    position: fixed !important;\n    top: 0;\n    bottom: 0;\n    right: 0;\n    z-index: 60;\n    width: min(88vw, 420px) !important;\n    box-sizing: border-box !important;\n    padding-bottom: env(safe-area-inset-bottom, 0px);\n    border-left: 1px solid var(--dsw-alias-border-l1);\n    box-shadow: -16px 0 48px rgba(0, 0, 0, 0.35);\n    transform: translateX(104%);\n    transition: transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1);\n    will-change: transform;\n  }\n  div[style*=\"grid-template-columns\"]:not([data-details-collapsed]) > div:nth-child(3) {\n    transform: translateX(0);\n  }\n  /* The app's concession solver resolves the details track to 0 on every\n     narrow viewport, so the plugin mirrors tool-call selection onto its\n     own frame attribute (set by the client JS). */\n  div[style*=\"grid-template-columns\"][data-dsh-mobile-details] > div:nth-child(3) {\n    transform: translateX(0);\n  }\n\n  /* The conversation header hosts the sidebar button in its top-left:\n     shift the header content right so nothing overlaps. */\n  header:has([role=\"tablist\"]) {\n    padding-left: 48px !important;\n  }\n\n  /* Header utility buttons (Session log, constraint files, ...) come from\n     different plugins with different heights — align them all. */\n  header:has([role=\"tablist\"]) [class*=\"headerUtilities\"] button {\n    min-height: 32px;\n    height: 32px;\n  }\n\n  /* Access mode lives in the model dropdown on mobile: hide the in-composer\n     trigger. Absolute keeps its Menu anchor in the layout; opacity keeps it\n     visually gone but programmatically clickable (the injected permission\n     row in the model menu clicks it). */\n  [aria-label^=\"访问模式\"],\n  [aria-label^=\"Access mode\"] {\n    position: absolute !important;\n    opacity: 0;\n    pointer-events: none;\n  }\n\n  /* The permission row injected into the model dropdown (mirrors the\n     ModelSelect cell shape). */\n  .dsh-mobile-perm-row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    width: 100%;\n    height: 40px;\n    padding: 0 10px;\n    border: none;\n    border-radius: 10px;\n    background: transparent;\n    color: var(--dsw-alias-label-primary, #e6e8ec);\n    font-size: 14px;\n    line-height: 22px;\n    cursor: pointer;\n    text-align: left;\n  }\n  .dsh-mobile-perm-row:hover {\n    background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));\n  }\n  .dsh-mobile-perm-label {\n    flex: 1 1 auto;\n    min-width: 0;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n  .dsh-mobile-perm-value {\n    flex: 0 1 auto;\n    min-width: 0;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    color: var(--dsw-alias-label-tertiary, #9aa0a8);\n  }\n  .dsh-mobile-perm-chevron {\n    flex: 0 0 auto;\n    display: inline-flex;\n    color: var(--dsw-alias-label-tertiary, #9aa0a8);\n  }\n\n  /* Composer control row: on narrow screens the row cannot fit the left\n     tools (Commands / Access mode / Attach) and the right trailing cluster\n     (model select / context meter / send) side by side — the app's flex\n     squeezes the left cluster to zero width and its buttons overlap. Wrap\n     into two rows instead: tools on the first, trailing on the second. */\n  div:has(> div[data-input-scroll=\"true\"]) > div:last-child {\n    flex-wrap: wrap;\n    row-gap: 6px;\n  }\n  div:has(> div[data-input-scroll=\"true\"]) > div:last-child > div:first-child {\n    flex: 0 0 auto;\n  }\n  div:has(> div[data-input-scroll=\"true\"]) > div:last-child > div:last-child {\n    flex: 1 1 100%;\n    justify-content: flex-start;\n    gap: 4px !important;\n  }\n  div:has(> div[data-input-scroll=\"true\"]) > div:last-child > div:last-child > :last-child {\n    margin-left: auto;\n  }\n\n  /* Context-injection source chips shrink with ellipsis instead of\n     being clipped at the viewport edge. */\n  [data-disclosure-row] [data-context-source] {\n    flex: 0 1 auto !important;\n  }\n\n  /* Modals get more room on phones. */\n  div[role=\"presentation\"] {\n    padding: 12px !important;\n  }\n}\n\n@keyframes dsh-mobile-drawer-in {\n  from { transform: translateX(-104%); }\n  to { transform: translateX(0); }\n}\n\n/* Tap-outside-to-close backdrop while a drawer is open. */\n[data-dsh-mobile-backdrop] {\n  position: fixed;\n  inset: 0;\n  z-index: 55;\n  display: none;\n  background: rgba(4, 6, 10, 0.35);\n  -webkit-backdrop-filter: blur(2px);\n  backdrop-filter: blur(2px);\n}\nhtml[data-dsh-mobile-drawer] [data-dsh-mobile-backdrop] {\n  display: block;\n}\n\n/* Sidebar button, docked into the top-left corner (the conversation\n   header gets matching left padding above; while the header is hidden in\n   the hero phase the button floats in the same corner). */\n[data-dsh-mobile-fab] {\n  position: fixed;\n  top: 12px;\n  left: 8px;\n  z-index: 50;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border: none;\n  border-radius: 999px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary, #b8bcc4);\n  cursor: pointer;\n  -webkit-tap-highlight-color: transparent;\n}\n@media (max-width: 720px) {\n  html[data-dsh-mobile-fab-show] [data-dsh-mobile-fab] {\n    display: inline-flex;\n  }\n}\n[data-dsh-mobile-fab]:active {\n  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));\n}\n\n/* Touch tuning: bigger icon-only targets, no tap highlight, pressed state,\n   and the hover-revealed Inspect pill (details entry) always visible. */\n@media (max-width: 720px) and (pointer: coarse) {\n  button:has(> svg):not([data-time-hover-root] button) {\n    min-width: 44px;\n    min-height: 44px;\n  }\n  button {\n    -webkit-tap-highlight-color: transparent;\n  }\n  button:active {\n    opacity: 0.75;\n  }\n  [data-tool] button {\n    opacity: 1 !important;\n  }\n}\n";
      document.head.appendChild(styleTag);
    }

    /** Tap-outside backdrop. */
    function injectBackdrop() {
      if (backdrop !== null) return;
      backdrop = document.createElement('div');
      backdrop.setAttribute('data-dsh-mobile-backdrop', '');
      backdrop.addEventListener('click', closeDrawers);
      document.body.appendChild(backdrop);
    }

    /** Top-left sidebar button. */
    function injectFab() {
      if (fab !== null) return;
      fab = document.createElement('button');
      fab.setAttribute('data-dsh-mobile-fab', '');
      fab.setAttribute('aria-label', 'Open sidebar');
      fab.innerHTML = FAB_ICON;
      fab.addEventListener('click', openSidebar);
      document.body.appendChild(fab);
    }

    /** viewport-fit=cover so env(safe-area-inset-*) works on notched devices. */
    function patchViewportMeta() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (meta === null) return;
      var content = meta.getAttribute('content') || '';
      if (content.indexOf('viewport-fit') !== -1) return;
      meta.setAttribute('content', content.replace(/\s*$/, '') + (content === '' ? '' : ', ') + 'viewport-fit=cover');
    }

    function apply() {
      if (applied) return;
      applied = true;
      patchViewportMeta();
      injectStyles();
      injectBackdrop();
      injectFab();
      mq = window.matchMedia(MOBILE_QUERY);
      var onChange = function () {
        syncBackdrop();
        syncFab();
      };
      if (mq.addEventListener !== undefined) mq.addEventListener('change', onChange);
      else if (mq.addListener !== undefined) mq.addListener(onChange);
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDrawers();
      });
      ensureFrameWatcher();
      ensureMenuWatcher();
      syncBackdrop();
      syncFab();
    }

    module.exports = { name: PLUGIN_ID, apply: apply };
    return module.exports;
  },
});
