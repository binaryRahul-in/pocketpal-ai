import type {
  InstalledRvcModel,
  RvcModelManifest,
  RvcValidationReport,
} from '../../types/rvc';
import {getCuratedRvcEntry, type RvcCatalogEntry} from './registry';
import {resolveSafeModelPath, validateRvcManifest} from './modelManifest';

export interface RvcModelFileSystem {
  exists(path: string): Promise<boolean>;
  readFile(path: string, encoding: 'utf8' | 'base64'): Promise<string>;
  mkdir(path: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface RvcHasher {
  sha256File(path: string): Promise<string>;
}

export interface RvcModelManagerDependencies {
  fileSystem: RvcModelFileSystem;
  hasher?: RvcHasher;
  rootDirectory: string;
  now?: () => number;
}

export interface RvcInstallSource {
  id: string;
  displayName: string;
  sourceRootPath: string;
  curatedCatalogId?: string;
}

export class RvcModelManager {
  private readonly dependencies: RvcModelManagerDependencies;
  private readonly models = new Map<string, InstalledRvcModel>();

  public constructor(dependencies: RvcModelManagerDependencies) {
    this.dependencies = dependencies;
  }

  public listInstalled(): InstalledRvcModel[] {
    return Array.from(this.models.values());
  }

  public getInstalled(id: string): InstalledRvcModel | undefined {
    return this.models.get(id);
  }

  public async install(source: RvcInstallSource): Promise<InstalledRvcModel> {
    if (
      source.curatedCatalogId &&
      !getCuratedRvcEntry(source.curatedCatalogId)
    ) {
      throw new Error(`Unknown curated RVC model: ${source.curatedCatalogId}`);
    }
    const manifest = await this.readManifest(source.sourceRootPath);
    const report = validateRvcManifest(manifest);
    if (!report.valid)
      throw new Error(
        `RVC model validation failed: ${report.errors.join(' ')}`,
      );
    const verified = await this.verifyFiles(
      source.sourceRootPath,
      manifest,
      report,
    );
    if (!verified.valid)
      throw new Error(
        `RVC model file verification failed: ${verified.errors.join(' ')}`,
      );

    const installedRoot = `${this.dependencies.rootDirectory}/${source.id}`;
    await this.dependencies.fileSystem.mkdir(installedRoot);
    for (const file of manifest.files) {
      await this.dependencies.fileSystem.copyFile(
        resolveSafeModelPath(source.sourceRootPath, file.path),
        resolveSafeModelPath(installedRoot, file.path),
      );
    }
    await this.dependencies.fileSystem.copyFile(
      resolveSafeModelPath(source.sourceRootPath, 'manifest.json'),
      resolveSafeModelPath(installedRoot, 'manifest.json'),
    );

    const model: InstalledRvcModel = {
      id: source.id,
      displayName: source.displayName,
      rootPath: installedRoot,
      manifest,
      validationStatus: 'valid',
      validationMessage: report.warnings.join(' ') || undefined,
      installedAt: this.dependencies.now?.() ?? Date.now(),
    };
    this.models.set(model.id, model);
    return model;
  }

  public async remove(id: string): Promise<void> {
    const model = this.models.get(id);
    if (!model) return;
    // The filesystem abstraction intentionally exposes file operations only. The
    // React Native adapter removes each validated manifest member, preventing a
    // caller from deleting an arbitrary path.
    const files = [
      ...model.manifest.files.map(file => file.path),
      'manifest.json',
    ];
    for (const file of files) {
      const path = resolveSafeModelPath(model.rootPath, file);
      if (await this.dependencies.fileSystem.exists(path))
        await this.dependencies.fileSystem.unlink(path);
    }
    this.models.delete(id);
  }

  public async validateInstalled(
    model: InstalledRvcModel,
  ): Promise<RvcValidationReport> {
    const manifest = await this.readManifest(model.rootPath);
    const report = validateRvcManifest(manifest);
    if (!report.valid || !this.dependencies.hasher) return report;
    return this.verifyFiles(model.rootPath, manifest, report);
  }

  private async readManifest(rootPath: string): Promise<RvcModelManifest> {
    const manifestPath = resolveSafeModelPath(rootPath, 'manifest.json');
    const exists = await this.dependencies.fileSystem.exists(manifestPath);
    if (!exists) throw new Error('RVC model bundle is missing manifest.json.');
    const raw = await this.dependencies.fileSystem.readFile(
      manifestPath,
      'utf8',
    );
    try {
      return JSON.parse(raw) as RvcModelManifest;
    } catch {
      throw new Error('RVC manifest.json is not valid JSON.');
    }
  }

  private async verifyFiles(
    rootPath: string,
    manifest: RvcModelManifest,
    report: RvcValidationReport,
  ): Promise<RvcValidationReport> {
    const errors = [...report.errors];
    for (const file of manifest.files) {
      const path = resolveSafeModelPath(rootPath, file.path);
      if (!(await this.dependencies.fileSystem.exists(path))) {
        errors.push(`Missing RVC model file: ${file.path}`);
        continue;
      }
      if (!this.dependencies.hasher) {
        errors.push(
          'RVC model hash verification is unavailable in this build.',
        );
        continue;
      }
      const actual = await this.dependencies.hasher.sha256File(path);
      if (actual.toLowerCase() !== file.sha256.toLowerCase())
        errors.push(`SHA-256 mismatch for ${file.path}`);
    }
    return {...report, valid: errors.length === 0, errors};
  }
}

export function isCuratedRvcEntry(entryId: string): boolean {
  return Boolean(getCuratedRvcEntry(entryId));
}

export function getCuratedRvcModel(
  entryId: string,
): RvcCatalogEntry | undefined {
  return getCuratedRvcEntry(entryId);
}
