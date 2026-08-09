import { join } from 'node:path';

export const CORE_YAML_FILES = [
  'module-config.yaml',
  'integrations.yaml',
  'business-details.yaml',
  'services.yaml',
  'compliance.yaml',
] as const;

export const CORE_MD_FILES = ['policies.md', 'faq.md'] as const;

export const MODULE_EXTRA_FILES = {
  call_screening: 'vip-list.yaml',
} as const;

export const SHARED_RAG_FILES = [
  'business-details.yaml',
  'services.yaml',
  'policies.md',
  'faq.md',
  'compliance.yaml',
] as const;

/** Files used for prompt assembly — never module-config or integrations */
export const PROMPT_SOURCE_FILES = [
  ...SHARED_RAG_FILES,
  'vip-list.yaml',
] as const;

export interface ClientPaths {
  clientSlug: string;
  kitRoot: string;
  clientDir: string;
  file: (name: string) => string;
}

export function resolveClientPaths(
  kitRoot: string,
  clientSlug: string,
): ClientPaths {
  const clientDir = join(kitRoot, 'clients', clientSlug);
  return {
    clientSlug,
    kitRoot,
    clientDir,
    file: (name: string) => join(clientDir, name),
  };
}

export function getEnvPaths(): ClientPaths {
  const kitRoot = process.env.DEPLOYMENT_KIT_PATH;
  if (!kitRoot) {
    throw new Error('DEPLOYMENT_KIT_PATH environment variable is required');
  }
  const clientSlug = process.env.CLIENT_SLUG;
  if (!clientSlug) {
    throw new Error('CLIENT_SLUG environment variable is required');
  }
  return resolveClientPaths(kitRoot, clientSlug);
}
