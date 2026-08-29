import type {RvcModelManifest, RvcPrecision} from '../../types/rvc';

export interface RvcCatalogEntry {
  id: string;
  displayName: string;
  provider: 'huggingface' | 'local';
  repoId?: string;
  revision?: string;
  files: string[];
  license: string;
  sourceUrl: string;
  precision: RvcPrecision;
  estimatedBytes: number;
  estimatedRamBytes: number;
  manifest: Pick<
    RvcModelManifest,
    | 'engineVersion'
    | 'inputSampleRate'
    | 'outputSampleRate'
    | 'contentDimension'
    | 'pitch'
    | 'supportsIndex'
  >;
}

export const CURATED_RVC_CATALOG: readonly RvcCatalogEntry[] = [
  {
    id: 'voiceclonnx-rvc-base-int8',
    displayName: 'RVC shared base (INT8)',
    provider: 'huggingface',
    repoId: 'TigreGotico/voiceclonnx-rvc',
    revision: 'main',
    files: ['contentvec_768l12_q8.onnx', 'rmvpe_q8.onnx'],
    license: 'MIT',
    sourceUrl: 'https://huggingface.co/TigreGotico/voiceclonnx-rvc',
    precision: 'int8',
    estimatedBytes: 185 * 1024 * 1024,
    estimatedRamBytes: 420 * 1024 * 1024,
    manifest: {
      engineVersion: 'rvc-v2',
      inputSampleRate: 16000,
      outputSampleRate: 40000,
      contentDimension: 768,
      pitch: {kind: 'rmvpe', classes: 360},
      supportsIndex: false,
    },
  },
];

export function getCuratedRvcEntry(id: string): RvcCatalogEntry | undefined {
  return CURATED_RVC_CATALOG.find(entry => entry.id === id);
}
