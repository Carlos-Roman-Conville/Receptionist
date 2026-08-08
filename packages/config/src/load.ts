import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  CORE_YAML_FILES,
  CORE_MD_FILES,
  MODULE_EXTRA_FILES,
  type ClientPaths,
  resolveClientPaths,
  getEnvPaths,
} from './paths.js';
import {
  assertNoFillPlaceholders,
  validateSchema,
  businessDetailsSchema,
  servicesSchema,
  complianceSchema,
  moduleConfigSchema,
  vipListSchema,
} from './schema.js';

export interface LoadedMarkdown {
  raw: string;
}

export interface ClientConfig {
  paths: ClientPaths;
  moduleConfig: ReturnType<typeof moduleConfigSchema.parse>;
  businessDetails: ReturnType<typeof businessDetailsSchema.parse>;
  services: ReturnType<typeof servicesSchema.parse>;
  compliance: ReturnType<typeof complianceSchema.parse>;
  policies: LoadedMarkdown;
  faq: LoadedMarkdown;
  vipList: Record<string, unknown> | null;
  /** Loaded for validation only — must not enter prompt assembly */
  integrationsRaw: string;
}

function readText(path: string, fileName: string): string {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${fileName} (${path})`);
  }
  return readFileSync(path, 'utf-8');
}

function readYamlFile(path: string, fileName: string): unknown {
  const raw = readText(path, fileName);
  assertNoFillPlaceholders(fileName, raw);
  return parseYaml(raw);
}

function moduleOn(
  modules: Record<string, boolean>,
  key: string,
): boolean {
  return modules[key] === true;
}

export function loadClientConfig(paths: ClientPaths): ClientConfig {
  for (const name of CORE_YAML_FILES) {
    readText(paths.file(name), name);
  }
  for (const name of CORE_MD_FILES) {
    readText(paths.file(name), name);
  }

  const moduleConfig = validateSchema(
    moduleConfigSchema,
    'module-config.yaml',
    readYamlFile(paths.file('module-config.yaml'), 'module-config.yaml'),
  );

  let vipList: Record<string, unknown> | null = null;
  if (moduleOn(moduleConfig.modules, 'call_screening')) {
    const extra = MODULE_EXTRA_FILES.call_screening;
    vipList = validateSchema(
      vipListSchema,
      extra,
      readYamlFile(paths.file(extra), extra),
    );
  }

  const integrationsRaw = readText(
    paths.file('integrations.yaml'),
    'integrations.yaml',
  );
  assertNoFillPlaceholders('integrations.yaml', integrationsRaw);

  return {
    paths,
    moduleConfig,
    businessDetails: validateSchema(
      businessDetailsSchema,
      'business-details.yaml',
      readYamlFile(paths.file('business-details.yaml'), 'business-details.yaml'),
    ),
    services: validateSchema(
      servicesSchema,
      'services.yaml',
      readYamlFile(paths.file('services.yaml'), 'services.yaml'),
    ),
    compliance: validateSchema(
      complianceSchema,
      'compliance.yaml',
      readYamlFile(paths.file('compliance.yaml'), 'compliance.yaml'),
    ),
    policies: { raw: readText(paths.file('policies.md'), 'policies.md') },
    faq: { raw: readText(paths.file('faq.md'), 'faq.md') },
    vipList,
    integrationsRaw,
  };
}

export function loadClientConfigFromEnv(): ClientConfig {
  return loadClientConfig(getEnvPaths());
}

export { getEnvPaths, resolveClientPaths };
