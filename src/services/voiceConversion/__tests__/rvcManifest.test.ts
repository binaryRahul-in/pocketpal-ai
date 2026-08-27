import {loadValidatedRvcManifest, parseRvcManifest, RvcManifestError, RvcRuntimeContract} from '../rvcManifest';

const good = {manifestVersion: 'rvc-on-device/1', artifact: {path: 'voice.onnx', format: 'onnx', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', license: 'MIT', sourceUrl: 'https://huggingface.co/TigreGotico/voiceclonnx-rvc'}, modelFamily: 'net_g_vits', generation: 'v2', sampleRate: 48000, featureExtractor: 'contentvec', featureDimension: 768, pitchExtractor: 'rmvpe', quantization: 'fp32', indexPresent: false, tensors: [{name: 'phone', shape: [-1, -1, 768]}, {name: 'pitch', shape: [-1, -1]}, {name: 'output', shape: [-1, 1, -1]}]} as const;
const contract: RvcRuntimeContract = {sampleRate: 48000, featureDimension: 768, pitchExtractor: 'rmvpe', requiredTensors: [{name: 'phone', shape: [-1, -1, 768]}]};

describe('RVC on-device manifest boundary', () => {
  it('accepts a known-good v2 48 kHz ONNX manifest', () => expect(loadValidatedRvcManifest(good, contract).artifact.format).toBe('onnx'));
  it('rejects PyTorch checkpoints', () => expect(() => parseRvcManifest({...good, artifact: {...good.artifact, path: 'voice.pth'}})).toThrow(RvcManifestError));
  it('detects sample-rate and feature-shape mismatches before inference', () => {
    expect(() => loadValidatedRvcManifest(good, {...contract, sampleRate: 40000})).toThrow('48000 Hz');
    expect(() => loadValidatedRvcManifest(good, {...contract, featureDimension: 256})).toThrow('Model features are');
  });
  it('detects tensor rank and static dimension mismatches', () => expect(() => loadValidatedRvcManifest(good, {...contract, requiredTensors: [{name: 'phone', shape: [-1, 768]}]})).toThrow('Tensor phone'));
  it('accepts an optional index only when explicitly declared', () => expect(parseRvcManifest({...good, indexPresent: true}).indexPresent).toBe(true));
});
