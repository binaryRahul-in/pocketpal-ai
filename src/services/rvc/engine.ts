import NativeRvcModule, {
  NativeRvcProcessResponse,
} from '../../specs/NativeRvcModule';

import {
  RvcInferenceOptions,
  RvcInferenceResult,
  RvcModelManifest,
} from './types';
import {resolveRvcIndexRate, validateRvcManifest} from './modelManifest';

export class RvcEngineUnavailableError extends Error {
  constructor(message = 'Native RVC engine is unavailable') {
    super(message);
    this.name = 'RvcEngineUnavailableError';
  }
}

export interface RvcEngineSession {
  sessionId: string;
  manifest: RvcModelManifest;
  startedAt: number;
}

export interface RvcPcmChunk {
  pcm16Base64: string;
  sampleRateHz: number;
  channels: number;
}

export function assertRvcEngineAvailable(): void {
  if (!NativeRvcModule) {
    throw new RvcEngineUnavailableError();
  }
}

export async function loadRvcSession(
  manifestValue: unknown,
  componentDirectory: string,
  options: RvcInferenceOptions,
): Promise<RvcEngineSession> {
  assertRvcEngineAvailable();
  const manifest = validateRvcManifest(manifestValue);
  const requestedIndexRate = resolveRvcIndexRate(manifest, options.indexRate);
  const {sessionId} = await NativeRvcModule!.load({
    manifestPath: `${componentDirectory}/${manifest.id}.json`,
    componentDirectory,
    pitchBackend: options.pitchBackend || manifest.pitchBackend,
    useIndex: requestedIndexRate > 0,
  });
  return {sessionId, manifest, startedAt: Date.now()};
}

function toResult(
  response: NativeRvcProcessResponse,
  backend: RvcInferenceResult['backend'] = 'native-bridge',
): RvcInferenceResult {
  const inputDurationMs = Math.max(0, response.inputDurationMs);
  return {
    backend,
    metrics: {
      inputDurationMs,
      outputDurationMs: Math.max(0, response.outputDurationMs),
      elapsedMs: Math.max(0, response.elapsedMs),
      realTimeFactor:
        inputDurationMs > 0 ? response.elapsedMs / inputDurationMs : 0,
      peakNativeBytes: response.peakNativeBytes,
      audioUnderruns: response.audioUnderruns,
    },
  };
}

export async function processRvcChunk(
  session: RvcEngineSession,
  chunk: RvcPcmChunk,
  options: RvcInferenceOptions,
): Promise<RvcPcmChunk & {result: RvcInferenceResult}> {
  assertRvcEngineAvailable();
  if (chunk.channels !== 1) {
    throw new Error('RVC input must be mono PCM');
  }
  const indexRate = resolveRvcIndexRate(session.manifest, options.indexRate);
  const response = await NativeRvcModule!.processChunk({
    sessionId: session.sessionId,
    pcm16Base64: chunk.pcm16Base64,
    sampleRateHz: chunk.sampleRateHz,
    channels: chunk.channels,
    pitchShiftSemitones: options.pitchShiftSemitones,
    indexRate,
    protectVoicelessConsonants: options.protectVoicelessConsonants,
  });
  return {
    pcm16Base64: response.pcm16Base64,
    sampleRateHz: response.sampleRateHz,
    channels: response.channels,
    result: toResult(response),
  };
}

export async function cancelRvcSession(
  session: RvcEngineSession,
): Promise<void> {
  assertRvcEngineAvailable();
  await NativeRvcModule!.cancel(session.sessionId);
}

export async function releaseRvcSession(
  session: RvcEngineSession,
): Promise<void> {
  if (NativeRvcModule) {
    await NativeRvcModule.release(session.sessionId);
  }
}
