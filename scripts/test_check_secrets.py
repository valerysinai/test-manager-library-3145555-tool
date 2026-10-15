"""Pruebas con ejemplos sintéticos generados en memoria; ninguna credencial real."""

from pathlib import Path
import subprocess
import tempfile
import unittest

from check_secrets import findings, scan


class SecretPatternsTest(unittest.TestCase):
    def test_representative_operational_secret_formats_are_detected(self):
        examples = [
            ("-----BEGIN " + "PRIVATE KEY-----", "private-key"),
            ("gh" + "p_" + "a" * 36, "github-token"),
            ("github_" + "pat_" + "a" * 50, "github-token"),
            ("AK" + "IA" + "A" * 16, "aws-access-key"),
            ("$" + "argon2id$v=19$m=1,t=1,p=1$fixture$fixture", "stored-password-hash"),
            ("$" + "2y$12$" + "a" * 53, "stored-password-hash"),
            ("postgresql://" + "fixture:fixture@db/library", "database-url-credentials"),
            ("JWT_" + "SECRET=synthetic-fixture", "literal-environment-secret"),
            ('{"pass' + 'word":"synthetic-fixture"}', "literal-password-or-secret"),
        ]
        for source, expected in examples:
            with self.subTest(rule=expected):
                self.assertIn((1, expected), findings(source))

    def test_empty_or_interpolated_environment_values_and_masked_examples_pass(self):
        for source in [
            "JWT_" + "SECRET=",
            "ADMIN_" + 'PASSWORD=""',
            "DB_" + "PASSWORD=$runtime_value",
            "APP_" + "KEY=$" + "{RUNTIME_VALUE}",
            '{"pass' + 'word":"********"}',
            '{"pass' + 'word":"<provided-at-runtime>"}',
        ]:
            with self.subTest(source_kind="placeholder"):
                self.assertEqual([], findings(source))

    def test_opaque_domain_fixture_is_not_a_precalculated_password_hash(self):
        self.assertEqual([], findings("opaque-fixture-value"))

    def test_report_contains_only_position_and_rule_not_the_matched_value(self):
        marker = "gh" + "p_" + "z" * 36
        report = findings("comment\n" + marker)
        self.assertEqual([(2, "github-token")], report)
        self.assertNotIn(marker, repr(report))

    def test_scan_uses_tracked_files_and_rejects_a_tracked_real_environment_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True, capture_output=True)
            (root / ".env.example").write_text("JWT_" + "SECRET=\n", encoding="utf-8")
            (root / "ignored-fixture").write_text("gh" + "p_" + "a" * 36, encoding="utf-8")
            subprocess.run(["git", "add", ".env.example"], cwd=root, check=True, capture_output=True)
            self.assertEqual([], scan(root))
            (root / ".env").write_text("DB_" + "PASSWORD=synthetic-fixture\n", encoding="utf-8")
            subprocess.run(["git", "add", ".env"], cwd=root, check=True, capture_output=True)
            self.assertIn((".env", 1, "tracked-environment-file"), scan(root))
            self.assertIn((".env", 1, "literal-environment-secret"), scan(root))
            (root / ".env").unlink()
            subprocess.run(["git", "rm", "--cached", "-q", ".env"], cwd=root, check=True, capture_output=True)
            self.assertEqual([], scan(root))


if __name__ == "__main__":
    unittest.main()
