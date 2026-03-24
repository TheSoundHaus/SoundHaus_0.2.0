import type { MenuItemConstructorOptions } from 'electron';

export interface SearchableMenuItem {
  /** Display label (e.g. "Save Snapshot") */
  label: string;
  /** Breadcrumb path (e.g. "Project > Save Snapshot") */
  breadcrumb: string;
  /** menu-action name to dispatch, or null for non-actionable items */
  action: string | null;
  /** Payload to send with the action (e.g. projectPath) */
  payload?: Record<string, unknown>;
  /** Whether the item is currently enabled */
  enabled: boolean;
  /** Keyboard accelerator hint (e.g. "CmdOrCtrl+Shift+P") */
  accelerator?: string;
}

/**
 * Walk the menu template and return a flat list of searchable command entries.
 * Separators, role-only items (undo/redo/cut/copy/paste etc.), and items without
 * labels are excluded.
 */
export function buildSearchableIndex(
  template: MenuItemConstructorOptions[],
  getPayloadForAction?: (action: string) => Record<string, unknown> | undefined
): SearchableMenuItem[] {
  const results: SearchableMenuItem[] = [];

  // Role-only items that are native Electron commands — not useful to search for
  const excludedRoles = new Set([
    'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
    'togglefullscreen', 'resetZoom', 'zoomIn', 'zoomOut',
    'toggleDevTools', 'close', 'quit'
  ]);

  function walk(items: MenuItemConstructorOptions[], parentLabel: string) {
    for (const item of items) {
      // Skip separators
      if (item.type === 'separator') continue;

      // Skip role-only items
      if (item.role && excludedRoles.has(item.role)) continue;

      const label = item.label;
      if (!label) continue;

      const breadcrumb = parentLabel ? `${parentLabel} > ${label}` : label;

      // If this item has a submenu, recurse into it
      if (item.submenu && Array.isArray(item.submenu)) {
        walk(item.submenu as MenuItemConstructorOptions[], breadcrumb);
        continue;
      }

      // Determine action from id (our convention: id = action name)
      const action = (item.id as string) ?? null;
      const enabled = item.enabled !== false;
      const payload = action && getPayloadForAction ? getPayloadForAction(action) : undefined;
      const accelerator = item.accelerator as string | undefined;

      results.push({ label, breadcrumb, action, payload, enabled, accelerator });
    }
  }

  walk(template, '');
  return results;
}
