"""Vercel Serverless 入口：复用 report-parser 的 FastAPI 应用。

Vercel Python runtime 会自动识别本文件导出的 ASGI `app`。
仓库根的 requirements.txt 提供运行依赖（fastapi/httpx/pymupdf/pydantic）。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT_PARSER_DIR = ROOT / "report-parser"
for path in (str(ROOT), str(REPORT_PARSER_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from main import app  # noqa: E402, F401  (FastAPI ASGI app：/api/parse、/api/match-labels、健康检查)
