import tempfile
import unittest
from pathlib import Path

from sdf.preview import needs_sdf_preview_repair, rewrite_static_preview_sdf, write_preview_sidecar_if_needed


SIMULATOR_SDF = """<?xml version="1.0"?>
<sdf version="1.12">
  <model name="cart">
    <link name="chassis" />
    <link name="caster" />
    <joint name="caster_ball_joint" type="ball">
      <parent>chassis</parent>
      <child>caster</child>
    </joint>
    <plugin filename="gz-sim-diff-drive-system" name="gz::sim::systems::DiffDrive">
      <left_joint>left_wheel_joint</left_joint>
    </plugin>
  </model>
</sdf>"""


class SdfPreviewTests(unittest.TestCase):
    def test_rewrites_simulator_only_features_for_viewer_preview(self) -> None:
        repaired = rewrite_static_preview_sdf(SIMULATOR_SDF)

        self.assertIn('<joint name="caster_ball_joint" type="fixed">', repaired)
        self.assertNotIn("<plugin", repaired)
        self.assertFalse(needs_sdf_preview_repair(repaired))

    def test_writes_hidden_viewer_sidecar_when_needed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tmp-sdf-preview-") as tempdir:
            output_path = Path(tempdir) / "cart.sdf"
            sidecar_path = write_preview_sidecar_if_needed(SIMULATOR_SDF, output_path=output_path)

            self.assertEqual(output_path.with_name("cart.viewer.sdf"), sidecar_path)
            self.assertIn('type="fixed"', sidecar_path.read_text(encoding="utf-8"))
            self.assertNotIn("gz-sim-diff-drive-system", sidecar_path.read_text(encoding="utf-8"))

    def test_removes_stale_sidecar_when_not_needed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tmp-sdf-preview-") as tempdir:
            output_path = Path(tempdir) / "cart.sdf"
            sidecar_path = output_path.with_name("cart.viewer.sdf")
            sidecar_path.write_text(SIMULATOR_SDF, encoding="utf-8")

            result = write_preview_sidecar_if_needed(
                '<sdf version="1.12"><model name="cart"><link name="base" /></model></sdf>',
                output_path=output_path,
            )

            self.assertIsNone(result)
            self.assertFalse(sidecar_path.exists())


if __name__ == "__main__":
    unittest.main()
