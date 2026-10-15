"""Control de patrones del artículo IX; nunca imprime el valor encontrado."""

from pathlib import Path
import re
import subprocess
import sys


RULES = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "github-token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "aws-access-key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "stored-password-hash": re.compile(r"\$(?:argon2(?:id|i)\$[^\s\"']+|2[aby]\$\d{2}\$[./A-Za-z0-9]{53})"),
    "database-url-credentials": re.compile(r"(?:postgres(?:ql)?|mysql)://[^:\s/]+:[^@\s/]+@"),
}
ASSIGNMENT = re.compile(
    r"""(?im)^\s*(?:JWT_SECRET|ADMIN_PASSWORD|DB_PASSWORD|APP_KEY)\s*=\s*(.*?)\s*$"""
)
LITERAL_SECRET = re.compile(
    r"""(?i)["'](?:password|password_hash|jwt_secret|admin_password|db_password)["']\s*(?:=>|:)\s*["']([^"'\r\n]+)["']"""
)


def placeholder(value: str) -> bool:
    value = value.strip().strip("\"'")
    return value == "" or value.startswith(("$", "<")) or set(value) <= {"*"}


def findings(source: str) -> list[tuple[int, str]]:
    result = []
    for number, line in enumerate(source.splitlines(), 1):
        for name, pattern in RULES.items():
            if pattern.search(line):
                result.append((number, name))
        assignment = ASSIGNMENT.match(line)
        if assignment and not placeholder(assignment.group(1)):
            result.append((number, "literal-environment-secret"))
        for literal in LITERAL_SECRET.finditer(line):
            if not placeholder(literal.group(1)):
                result.append((number, "literal-password-or-secret"))
    return result


def scan(root: Path) -> list[tuple[str, int, str]]:
    # Solo archivos versionados del checkout. Sin exclusiones de tests, lockfiles o docs.
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True
    ).stdout.split(b"\0")
    result = []
    for raw in tracked:
        if not raw:
            continue
        relative = raw.decode("utf-8", errors="surrogateescape")
        path = root / relative
        if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example"):
            result.append((relative, 1, "tracked-environment-file"))
        if not path.is_file():
            raise RuntimeError("Falta un archivo versionado en el checkout.")
        source = path.read_bytes().decode("utf-8", errors="replace")
        result.extend((relative, number, rule) for number, rule in findings(source))
    return result


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    try:
        matches = scan(root)
    except (OSError, RuntimeError, subprocess.CalledProcessError):
        print("No se pudo completar el control de secretos.", file=sys.stderr)
        return 2
    for path, number, rule in matches:
        # repr escapa nombres que pudieran alterar el formato de logs; sin contenido.
        print(f"{path!r}:{number}: {rule}", file=sys.stderr)
    if matches:
        return 1
    print("Secret pattern scan passed for tracked files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
