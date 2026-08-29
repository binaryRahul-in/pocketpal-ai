import json
import tempfile
import unittest
from pathlib import Path

from rvc_quant_audit import POLICIES, compare_outputs, read_manifest, synthetic_manifest


class AuditHarnessTests(unittest.TestCase):
    def test_component_policy_covers_full_pipeline(self):
        self.assertEqual({policy.component for policy in POLICIES}, {
            "content_encoder", "pitch_extractor", "voice_generator",
            "retrieval_index", "preprocessing", "postprocessing",
        })
        self.assertEqual(next(p for p in POLICIES if p.component == "pitch_extractor").quantization, "fp32_only")

    def test_metrics_are_reproducible(self):
        result = compare_outputs([0.0, 1.0, -1.0], [0.0, 1.01, -0.99])
        self.assertEqual(result.samples, 3)
        self.assertAlmostEqual(result.mae, 0.00666666, places=5)
        self.assertGreater(result.cosine_similarity, 0.99)
        self.assertGreater(result.snr_db, 30)

    def test_synthetic_manifest_is_local_and_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = synthetic_manifest(directory, count=2)
            records = read_manifest(manifest_path)
            self.assertEqual(len(records), 2)
            self.assertTrue(all(Path(record["audio"]).is_absolute() for record in records))
            self.assertEqual(json.loads(manifest_path.read_text().splitlines()[0])["purpose"], "synthetic_sine_fixture")


if __name__ == "__main__":
    unittest.main()
