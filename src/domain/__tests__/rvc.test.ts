import {
  RvcContractError,
  validateRvcConfig,
  validateRvcProfile,
  type RvcModelManifest,
  type RvcProfile,
} from '../rvc';

describe('RVC domain contracts', () => {
  const manifest: RvcModelManifest = {
    id: 'speaker-a',
    displayName: 'Speaker A',
    modelVersion: 'v2',
    sampleRate: 40000,
    targetSpeaker: 'Speaker A',
    modelPath: '/models/speaker-a.pth',
    index: {path: '/models/speaker-a.index'},
    supportedPitchExtractors: ['rmvpe'],
    supportedInputModes: ['speech-to-speech', 'tts-to-rvc'],
  };

  const profile: RvcProfile = {
    id: 'profile-a',
    name: 'Speaker A / RMVPE',
    modelId: manifest.id,
    inputMode: 'tts-to-rvc',
    pitchExtractor: 'rmvpe',
    indexMode: 'local',
    indexRate: 0.5,
    chunkDurationMs: 160,
    executionProvider: 'cpu',
    quantization: 'fp32',
  };

  it('represents both speech-to-speech and TTS-to-RVC profiles', () => {
    expect(manifest.supportedInputModes).toEqual(['speech-to-speech', 'tts-to-rvc']);
    expect(validateRvcProfile(profile, manifest).f0Method).toBe('rmvpe');
  });

  it('rejects a positive index rate without an installed index', () => {
    expect(() => validateRvcConfig({
      sampleRate: 40000,
      modelVersion: 'v2',
      f0Method: 'rmvpe',
      indexMode: 'none',
      indexRate: 0.1,
      chunkDurationMs: 160,
      executionProvider: 'cpu',
      quantization: 'fp32',
    })).toThrow(RvcContractError);
  });

  it('rejects positive index rate when the manifest has no index', () => {
    const {index: _index, ...withoutIndex} = manifest;
    expect(() => validateRvcConfig({
      sampleRate: 40000,
      modelVersion: 'v2',
      f0Method: 'rmvpe',
      indexMode: 'local',
      indexRate: 0.1,
      chunkDurationMs: 160,
      executionProvider: 'cpu',
      quantization: 'fp32',
    }, withoutIndex)).toThrow('requires an installed index');
  });

  it('allows zero index rate with no index', () => {
    expect(() => validateRvcConfig({
      sampleRate: 40000,
      modelVersion: 'v2',
      f0Method: 'rmvpe',
      indexMode: 'none',
      indexRate: 0,
      chunkDurationMs: 160,
      executionProvider: 'cpu',
      quantization: 'fp32',
    })).not.toThrow();
  });
});
