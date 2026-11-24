#!/usr/bin/env python3
"""Build one self-contained HTML file from the paid performance report.

Inlines the stylesheet, the dashboard script and the report data, so the file opens from disk with no server
and no hosting. Keep the output out of the public repo: it contains spend and trial numbers.

Usage:
  python3 agent/paid_report.py --input <workbook.xlsx>
  python3 agent/build_paid_dashboard.py
"""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "agent" / "paid_dashboard"
DEFAULT_DATA = ROOT / "data" / "paid-report.js"
DEFAULT_OUTPUT = ROOT / "data" / "paid-dashboard.html"


def build(data_path: Path, output: Path):
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "dashboard.css").read_text(encoding="utf-8")
    js = (SRC / "dashboard.js").read_text(encoding="utf-8")
    data = data_path.read_text(encoding="utf-8")
    # Keep the inline data from closing its own script tag.
    data = data.replace("</", "<\\/")

    html = html.replace('<link rel="stylesheet" href="dashboard.css">', "<style>\n" + css + "\n</style>")
    html = html.replace('<script src="report.js"></script>', "<script>\n" + data + "\n</script>")
    html = html.replace('<script src="dashboard.js"></script>', "<script>\n" + js + "\n</script>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    return output


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()
    out = build(args.data, args.output)
    print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
