/**
 * Versioned, transport-independent manifest for installable RVC bundles.
 *
 * A bundle is intentionally data-only: every model component is an ONNX file,
 * paths are relative to the bundle root, and the manifest/checksum files are
 * validated before a caller is allowed to move the bundle into model storage.
 */

export const RVC_BUNDLE_FORMAT = 'pocketpal-rvc-bundle';
export const RVC_BUNDLE_MANIFEST_VERSION = 1;
export const RVC_BUNDLE_MANIFEST_PATH = 'metadata/manifest.json';
export const RVC_BUNDLE_CHECKSUMS_PATH = 'metadata/checksums.sha256';

export type RVCBundleSource = 'huggingface' | 'local';
export type RVCBundleComponentRole =
  | 'content_encoder'
  | 'pitch'
  | 'voice'
  | 'index';
export type RVCBundleQuantization =
  | 'none'
  | 'fp32'
  | 'fp16'
  | 'int8'
  | 'int4'
  | 'mixed';
export type RVCFeatureVersion = 'v1' | 'v2';

export interface RVCBundleComponent {
  role: RVCBundleComponentRole;
  path: string;
  format: 'onnx' | 'index';
  sha256: string;
  bytes: number;
  license?: string;
  provenanceUrl?: string;
}

export interface RVCBundleManifest {
  format: typeof RVC_BUNDLE_FORMAT;
  manifestVersion: typeof RVC_BUNDLE_MANIFEST_VERSION;
  id: string;
  name: string;
  source: {
    kind: RVCBundleSource;
    repository?: string;
    revision?: string;
    provenanceUrl?: string;
    communityUploaded: boolean;
  };
  license: {
    spdxId: string;
    name?: string;
    url?: string;
  };
  runtime: {
    format: 'onnx';
    providers: string[];
    minimumRamBytes: number;
    diskBytes: number;
    abi: string[];
  };
  audio: {
    sampleRate: number;
    featureVersion: RVCFeatureVersion;
    featureDimensions: {v1: number; v2: number};
  };
  quantization: RVCBundleQuantization;
  policy: {
    indexRateDefault: number;
    supportedExtractors: string[];
  };
  components: {
    contentEncoder: RVCBundleComponent;
    pitch: RVCBundleComponent;
    voice: RVCBundleComponent;
    index?: RVCBundleComponent;
  };
  metadata: {
    checksumFile: typeof RVC_BUNDLE_CHECKSUMS_PATH;
    createdAt?: string;
  };
}

export interface RVCBundleFile {
  sha256: string;
  bytes?: number;
}

export interface RVCBundleValidationOptions {
  /** Hashes and sizes obtained from the extracted files, keyed by safe path. */
  files?: Record<string, RVCBundleFile>;
  /** Contents of metadata/checksums.sha256, in standard `hash  path` form. */
  checksumText?: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PATH =
  /^(?!\/)(?!.*(?:^|\/)\.\.?\/?)(?!.*\\)(?!.*\/\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const EXECUTABLE_EXTENSIONS = new Set([
  'apk',
  'bat',
  'com',
  'dll',
  'dylib',
  'exe',
  'jar',
  'sh',
  'so',
]);
const REQUIRED_COMPONENTS = ['contentEncoder', 'pitch', 'voice'] as const;
const COMPONENT_KEYS = new Set(['contentEncoder', 'pitch', 'voice', 'index']);

function fail(message: string): never {
  throw new Error(`Invalid RVC bundle manifest: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (pattern && !pattern.test(value))
  ) {
    fail(`${name} must be a valid string`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    fail(`${name} must be a positive integer`);
  return value;
}

function arrayOfStrings(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(item => typeof item !== 'string' || item.length === 0)
  )
    fail(`${name} must be a non-empty string array`);
  return [...value] as string[];
}

function safeModelPath(
  value: unknown,
  name: string,
  format: 'onnx' | 'index',
): string {
  const path = string(value, name, SAFE_PATH);
  const extension = path.split('.').pop()?.toLowerCase();
  if (
    EXECUTABLE_EXTENSIONS.has(extension || '') ||
    extension === 'pth' ||
    extension === 'pt'
  )
    fail(`${name} uses a forbidden executable or PTH format`);
  if (format === 'onnx' && extension !== 'onnx')
    fail(`${name} must point to an ONNX file`);
  if (format === 'index' && extension !== 'index')
    fail(`${name} must point to an index file`);
  if (!path.startsWith('components/'))
    fail(`${name} must be under components/`);
  return path;
}

function component(
  value: unknown,
  key: string,
  expectedRole: RVCBundleComponentRole,
  format: 'onnx' | 'index',
): RVCBundleComponent {
  const item = record(value, `components.${key}`);
  const role = string(
    item.role,
    `components.${key}.role`,
  ) as RVCBundleComponentRole;
  if (role !== expectedRole)
    fail(`components.${key}.role must be ${expectedRole}`);
  if (item.format !== format)
    fail(`components.${key}.format must be ${format}`);
  const result: RVCBundleComponent = {
    role,
    path: safeModelPath(item.path, `components.${key}.path`, format),
    format,
    sha256: string(item.sha256, `components.${key}.sha256`, SHA256),
    bytes: positiveInteger(item.bytes, `components.${key}.bytes`),
  };
  if (item.license !== undefined)
    result.license = string(item.license, `components.${key}.license`);
  if (item.provenanceUrl !== undefined)
    result.provenanceUrl = string(
      item.provenanceUrl,
      `components.${key}.provenanceUrl`,
    );
  return result;
}

export function parseRVCModelBundleManifest(
  input: string | unknown,
  options: RVCBundleValidationOptions = {},
): RVCBundleManifest {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      fail('manifest is not valid JSON');
    }
  }
  const root = record(raw, 'manifest');
  if (root.format !== RVC_BUNDLE_FORMAT) fail('unsupported bundle format');
  if (root.manifestVersion !== RVC_BUNDLE_MANIFEST_VERSION)
    fail('unsupported manifest version');
  const source = record(root.source, 'source');
  const sourceKind = string(source.kind, 'source.kind') as RVCBundleSource;
  if (sourceKind !== 'huggingface' && sourceKind !== 'local')
    fail('source.kind must be huggingface or local');
  if (sourceKind === 'huggingface' && typeof source.repository !== 'string')
    fail('Hugging Face bundles require source.repository');
  const license = record(root.license, 'license');
  const runtime = record(root.runtime, 'runtime');
  if (runtime.format !== 'onnx') fail('runtime.format must be onnx');
  const audio = record(root.audio, 'audio');
  const dimensions = record(audio.featureDimensions, 'audio.featureDimensions');
  const policy = record(root.policy, 'policy');
  const components = record(root.components, 'components');
  for (const key of REQUIRED_COMPONENTS)
    if (!(key in components)) fail(`missing required component ${key}`);
  for (const key of Object.keys(components))
    if (!COMPONENT_KEYS.has(key)) fail(`unknown component ${key}`);
  const metadata = record(root.metadata, 'metadata');
  if (metadata.checksumFile !== RVC_BUNDLE_CHECKSUMS_PATH)
    fail(`metadata.checksumFile must be ${RVC_BUNDLE_CHECKSUMS_PATH}`);

  const manifest: RVCBundleManifest = {
    format: RVC_BUNDLE_FORMAT,
    manifestVersion: RVC_BUNDLE_MANIFEST_VERSION,
    id: string(root.id, 'id', SAFE_ID),
    name: string(root.name, 'name'),
    source: {
      kind: sourceKind,
      repository: source.repository as string | undefined,
      revision: source.revision as string | undefined,
      provenanceUrl: source.provenanceUrl as string | undefined,
      communityUploaded: source.communityUploaded === true,
    },
    license: {
      spdxId: string(license.spdxId, 'license.spdxId'),
      name: license.name as string | undefined,
      url: license.url as string | undefined,
    },
    runtime: {
      format: 'onnx',
      providers: arrayOfStrings(runtime.providers, 'runtime.providers'),
      minimumRamBytes: positiveInteger(
        runtime.minimumRamBytes,
        'runtime.minimumRamBytes',
      ),
      diskBytes: positiveInteger(runtime.diskBytes, 'runtime.diskBytes'),
      abi: arrayOfStrings(runtime.abi, 'runtime.abi'),
    },
    audio: {
      sampleRate: positiveInteger(audio.sampleRate, 'audio.sampleRate'),
      featureVersion: string(
        audio.featureVersion,
        'audio.featureVersion',
      ) as RVCFeatureVersion,
      featureDimensions: {
        v1: positiveInteger(dimensions.v1, 'audio.featureDimensions.v1'),
        v2: positiveInteger(dimensions.v2, 'audio.featureDimensions.v2'),
      },
    },
    quantization: string(
      root.quantization,
      'quantization',
    ) as RVCBundleQuantization,
    policy: {
      indexRateDefault:
        typeof policy.indexRateDefault === 'number' &&
        policy.indexRateDefault >= 0 &&
        policy.indexRateDefault <= 1
          ? policy.indexRateDefault
          : fail('policy.indexRateDefault must be between 0 and 1'),
      supportedExtractors: arrayOfStrings(
        policy.supportedExtractors,
        'policy.supportedExtractors',
      ),
    },
    components: {
      contentEncoder: component(
        components.contentEncoder,
        'contentEncoder',
        'content_encoder',
        'onnx',
      ),
      pitch: component(components.pitch, 'pitch', 'pitch', 'onnx'),
      voice: component(components.voice, 'voice', 'voice', 'onnx'),
      ...(components.index === undefined
        ? {}
        : {index: component(components.index, 'index', 'index', 'index')}),
    },
    metadata: {
      checksumFile: RVC_BUNDLE_CHECKSUMS_PATH,
      createdAt: metadata.createdAt as string | undefined,
    },
  };
  if (!['v1', 'v2'].includes(manifest.audio.featureVersion))
    fail('audio.featureVersion must be v1 or v2');
  if (
    !['none', 'fp32', 'fp16', 'int8', 'int4', 'mixed'].includes(
      manifest.quantization,
    )
  )
    fail('unsupported quantization');
  validateRVCModelBundle(manifest, options);
  return manifest;
}

export function validateRVCModelBundle(
  manifest: RVCBundleManifest,
  options: RVCBundleValidationOptions = {},
): void {
  const entries = Object.values(manifest.components) as RVCBundleComponent[];
  const paths = new Set<string>();
  for (const item of entries) {
    if (paths.has(item.path)) fail(`duplicate component path ${item.path}`);
    paths.add(item.path);
    const actual = options.files?.[item.path];
    if (
      actual &&
      (actual.sha256 !== item.sha256 ||
        (actual.bytes !== undefined && actual.bytes !== item.bytes))
    )
      fail(`checksum or size mismatch for ${item.path}`);
  }
  if (options.checksumText !== undefined) {
    const listed = new Map<string, string>();
    for (const line of options.checksumText.split(/\r?\n/).filter(Boolean)) {
      const match = line.match(/^([a-f0-9]{64})\x20\x20(.+)$/);
      if (!match || !SAFE_PATH.test(match[2])) fail('malformed checksum file');
      listed.set(match[2], match[1]);
    }
    for (const item of entries)
      if (listed.get(item.path) !== item.sha256)
        fail(`checksum file mismatch for ${item.path}`);
  }
}

export const parseRVCBundleManifest = parseRVCModelBundleManifest;
