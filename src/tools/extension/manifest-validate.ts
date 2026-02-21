import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateManifest } from '../../utils/manifest-schema.js';

export const manifestValidateSchema = z.object({
  extensionPath: z.string().optional().describe('Path to extension directory. Uses loaded extension if omitted.'),
});

export type ManifestValidateInput = z.infer<typeof manifestValidateSchema>;

export async function manifestValidate(
  extensionPath: string | undefined,
  loadedManifestPath?: string,
): Promise<string> {
  const manifestPath = extensionPath
    ? path.resolve(extensionPath, 'manifest.json')
    : loadedManifestPath;

  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return JSON.stringify({ error: 'manifest.json not found. Provide extensionPath or load an extension first.' });
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    return JSON.stringify({ error: `Failed to parse manifest.json: ${e}` });
  }

  const issues = validateManifest(manifest, manifestPath);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const infos = issues.filter((i) => i.level === 'info');

  return JSON.stringify(
    {
      valid: errors.length === 0,
      summary: `${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`,
      issues,
    },
    null,
    2,
  );
}
