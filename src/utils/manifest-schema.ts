export interface ManifestIssue {
  level: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

export function validateManifest(manifest: any, filePath: string): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  // Required fields
  if (!manifest.manifest_version) {
    issues.push({ level: 'error', field: 'manifest_version', message: 'Missing required field' });
  } else if (manifest.manifest_version !== 3) {
    issues.push({ level: 'error', field: 'manifest_version', message: `Expected 3, got ${manifest.manifest_version}. MV2 is deprecated.` });
  }

  if (!manifest.name) {
    issues.push({ level: 'error', field: 'name', message: 'Missing required field' });
  }

  if (!manifest.version) {
    issues.push({ level: 'error', field: 'version', message: 'Missing required field' });
  } else if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    issues.push({ level: 'error', field: 'version', message: 'Must be 1-4 dot-separated integers' });
  }

  // MV3-specific checks
  if (manifest.background) {
    if (manifest.background.scripts) {
      issues.push({ level: 'error', field: 'background.scripts', message: 'MV3 uses service_worker, not background scripts' });
    }
    if (manifest.background.page) {
      issues.push({ level: 'error', field: 'background.page', message: 'MV3 uses service_worker, not background page' });
    }
    if (manifest.background.persistent !== undefined) {
      issues.push({ level: 'warning', field: 'background.persistent', message: 'persistent flag is ignored in MV3' });
    }
  }

  // Content Security Policy
  if (typeof manifest.content_security_policy === 'string') {
    issues.push({ level: 'error', field: 'content_security_policy', message: 'MV3 requires object format: { extension_pages: "..." }' });
  }

  // Web accessible resources
  if (Array.isArray(manifest.web_accessible_resources)) {
    for (let i = 0; i < manifest.web_accessible_resources.length; i++) {
      const entry = manifest.web_accessible_resources[i];
      if (typeof entry === 'string') {
        issues.push({ level: 'error', field: `web_accessible_resources[${i}]`, message: 'MV3 requires object format with resources and matches' });
        break;
      }
    }
  }

  // Permissions checks
  if (manifest.permissions) {
    const deprecated = ['tabs', 'webRequest', 'webRequestBlocking'];
    for (const perm of manifest.permissions) {
      if (perm === 'webRequestBlocking') {
        issues.push({ level: 'error', field: 'permissions', message: 'webRequestBlocking not available in MV3. Use declarativeNetRequest.' });
      }
    }

    // Host permissions should be separate in MV3
    const hostPerms = manifest.permissions.filter((p: string) =>
      p.includes('://') || p === '<all_urls>',
    );
    if (hostPerms.length > 0) {
      issues.push({ level: 'warning', field: 'permissions', message: `Host permissions should be in host_permissions: ${hostPerms.join(', ')}` });
    }
  }

  // Action vs browser_action/page_action
  if (manifest.browser_action) {
    issues.push({ level: 'error', field: 'browser_action', message: 'MV3 uses "action" instead of "browser_action"' });
  }
  if (manifest.page_action) {
    issues.push({ level: 'error', field: 'page_action', message: 'MV3 uses "action" instead of "page_action"' });
  }

  // Recommended fields
  if (!manifest.description) {
    issues.push({ level: 'info', field: 'description', message: 'Recommended for Chrome Web Store listing' });
  }
  if (!manifest.icons) {
    issues.push({ level: 'warning', field: 'icons', message: 'No icons defined. Recommended: 16, 48, 128' });
  }

  return issues;
}
