"""体检报告解析服务 - FastAPI 薄代理（多模态大模型直读）。"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
import time
from threading import Lock

from parser.vision_engine import VisionEngine, VisionEngineError, get_vision_status

app = FastAPI(title="Medical Report Parser", version="2.0.0")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("medical-report-parser")

# CORS - 默认允许本地开发 + 已部署前端域名。
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://health-data-mgmt.vercel.app",
    ).split(",")
    if origin.strip()
]
ALLOW_ALL_ORIGINS = "*" in ALLOWED_ORIGINS
ALLOW_CREDENTIALS = os.getenv(
    "CORS_ALLOW_CREDENTIALS",
    "false" if ALLOW_ALL_ORIGINS else "true",
).lower() == "true"

if ALLOW_ALL_ORIGINS and ALLOW_CREDENTIALS:
    ALLOW_CREDENTIALS = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOW_ALL_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

USE_MOCK = os.getenv("USE_MOCK", "false").lower() == "true"
engine: Optional[VisionEngine] = None
engine_lock = Lock()


def get_engine() -> VisionEngine:
    global engine
    if engine is None:
        with engine_lock:
            if engine is None:
                engine = VisionEngine(use_mock=USE_MOCK)
    return engine


class ExtractedIndicator(BaseModel):
    rawLabel: str
    value: float
    unit: str
    referenceRange: Optional[str] = None
    pageIndex: int


class ParseResponse(BaseModel):
    success: bool
    pageCount: int
    reportDate: Optional[str] = None
    tables: List[dict]
    indicators: List[ExtractedIndicator]
    markdown: str
    error: Optional[str] = None


@app.get("/api/health")
async def health_check():
    """深度检查：确认渲染依赖（PyMuPDF）可导入与模型配置状态。"""
    status = get_vision_status()
    pymupdf_ready = True
    import_error: Optional[str] = None
    try:
        import pymupdf  # noqa: F401
    except ImportError:
        try:
            import fitz  # noqa: F401
        except Exception as exc:  # pragma: no cover
            pymupdf_ready = False
            import_error = str(exc)
    if not pymupdf_ready:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "PDF 渲染依赖不可用：缺少 PyMuPDF",
                "engine": status["engine"],
                "import_error": import_error,
            },
        )
    return {
        "status": "ok",
        "model": status["engine"],
        "mock_mode": USE_MOCK,
        "ocr_ready": True,
        "engine_initialized": engine is not None,
        "vision_llm": {
            "api_key_configured": status["api_key_configured"],
            "base_url": status["base_url"],
            "model": status["model"],
            "fallback_model": status.get("fallback_model"),
            "timeout_sec": status["timeout_sec"],
        },
    }


@app.get("/api/healthz")
async def service_health_check():
    """Render 健康检查：只验证进程存活与依赖可导入，不访问模型服务。"""
    status = get_vision_status()
    try:
        import pymupdf  # noqa: F401
    except ImportError:
        try:
            import fitz  # noqa: F401
        except Exception as exc:  # pragma: no cover
            raise HTTPException(
            status_code=503,
            detail={
                "message": "PDF 渲染依赖不可用",
                "engine": status["engine"],
                "import_error": str(exc),
            },
        )
    return {
        "status": "ok",
        "ocr_ready": True,
        "model": status["engine"],
        "engine_initialized": engine is not None,
        "mock_mode": USE_MOCK,
        "vision_llm_api_key_configured": status["api_key_configured"],
    }


@app.get("/api/ocr-readyz")
async def ocr_ready_check():
    """手动深度检查：显式初始化引擎并校验模型配置，仅用于排障。"""
    status = get_vision_status()
    try:
        loaded_engine = get_engine()
        loaded_engine.refresh_config()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "解析引擎初始化失败",
                "engine": status["engine"],
                "error": str(exc),
            },
        ) from exc
    return {
        "status": "ok",
        "ocr_ready": True,
        "model": status["engine"],
        "engine_initialized": True,
        "vision_llm": {
            "api_key_configured": status["api_key_configured"],
            "base_url": status["base_url"],
            "model": status["model"],
            "fallback_model": status.get("fallback_model"),
        },
    }


@app.post("/api/parse", response_model=ParseResponse)
async def parse_report(file: UploadFile = File(...)):
    """解析体检报告 PDF/图片：图片直发多模态大模型。"""
    started_at = time.perf_counter()
    allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    allowed_ext = (".pdf", ".jpg", ".jpeg", ".png")
    if content_type not in allowed_types and not filename.endswith(allowed_ext):
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")

    try:
        logger.info(
            "parse_start filename=%s content_type=%s size_bytes=%d engine=multimodal-vision",
            file.filename or "unknown",
            content_type or "unknown",
            len(content),
        )
        result = get_engine().parse_pdf(content, file.filename or "unknown")
        logger.info(
            "parse_done filename=%s success=%s elapsed_sec=%.2f page_count=%s indicator_count=%s",
            file.filename or "unknown",
            result.get("success"),
            time.perf_counter() - started_at,
            result.get("pageCount"),
            len(result.get("indicators", [])),
        )
        return result
    except VisionEngineError as e:
        logger.error(
            "parse_vision_error filename=%s elapsed_sec=%.2f error=%s",
            file.filename or "unknown",
            time.perf_counter() - started_at,
            e,
        )
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception(
            "parse_exception filename=%s elapsed_sec=%.2f",
            file.filename or "unknown",
            time.perf_counter() - started_at,
        )
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
