"""多模态大模型直读引擎：体检报告图片/PDF → 结构化指标 JSON（薄代理）。

设计要点：
- 不做本地 OCR：图片直接提交给多模态模型（OpenAI 兼容 chat/completions 接口）
- 模型、端点、key、超时全部来自环境变量，切换模型不改代码
- 输出契约与原解析引擎保持一致（success/pageCount/reportDate/tables/indicators/markdown）
"""
import base64
import json
import logging
import math
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("medical-report-vision")

REPORT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "reportDate": {"type": "string", "description": "报告日期 YYYY-MM-DD，无法确认为空字符串"},
        "indicators": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rawLabel": {"type": "string", "description": "指标名，中文名(英文缩写)优先"},
                    "value": {"type": "number", "description": "纯数值，去掉箭头/星号/H/L 修饰"},
                    "unit": {"type": "string"},
                    "referenceRange": {"type": "string", "description": "参考范围，没有为空字符串"},
                    "pageIndex": {"type": "integer", "description": "从 0 开始的页码"},
                },
                "required": ["rawLabel", "value", "unit", "referenceRange", "pageIndex"],
            },
        },
    },
    "required": ["reportDate", "indicators"],
}

SYSTEM_PROMPT = """
你是中文体检/检验报告结构化助手。请直接阅读图片中的报告内容，输出结构化指标 JSON。

严格遵守以下规则：
1. 只提取检验指标、体征指标，不要输出姓名、性别、年龄、日期、时间、编号、条码、结论、建议、表头、页脚。
2. 同一指标同时出现中文名和英文缩写时，rawLabel 优先输出“中文名(缩写)”，例如“白细胞(WBC)”；没有中文名时只保留英文缩写，例如“ALT”。
3. value 必须是纯数字；源文本中的箭头、星号、H/L、<、> 等修饰一律去掉，只保留数值本身。
4. unit 保留原报告单位；没有单位返回空字符串。referenceRange 保留原报告参考范围；没有返回空字符串。
5. pageIndex 从 0 开始，对应所给图片的序号。
6. 不要把日期、报告号、条码号、身份证号、手机号、医院名称等误识别成指标；不确定的指标不要输出。
7. 同页完全重复的指标行只保留一条。
8. 只返回一个 JSON 对象，不要输出解释、Markdown 或任何额外文字。
9. 输出必须严格是如下结构（indicators 是数组，每个指标一个对象）：
   {"reportDate": "YYYY-MM-DD 或空", "indicators": [{"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0}]}
   不要把指标组织成以指标名为 key 的字典。
""".strip()

USER_INSTRUCTION = "请阅读以上体检报告图片，输出符合 schema 的结构化指标 JSON。"

METADATA_KEYWORDS = (
    "report date", "sample date", "test date", "collection date",
    "检验日期", "报告日期", "采样日期", "送检日期", "日期", "报告时间", "打印时间",
    "姓名", "性别", "年龄", "条码", "编号",
)

# 每个请求只带一张图片：glm-4v-flash 对多图输入的响应不可靠
# （实测两图时可能只处理第一张），逐页请求换来确定性与稳定性
MAX_IMAGES_PER_REQUEST = 1
# PDF 渲染缩放（1.0 = 72dpi；报告正文 144dpi 足够清晰且体积可控）
PDF_RENDER_SCALE = 2.0
# PDF 最大处理页数（防止异常大文件拖垮请求）
MAX_PDF_PAGES = 8

MOCK_INDICATORS = [
    {"rawLabel": "收缩压", "value": 118, "unit": "mmHg", "referenceRange": "90-139", "pageIndex": 0},
    {"rawLabel": "舒张压", "value": 76, "unit": "mmHg", "referenceRange": "60-89", "pageIndex": 0},
    {"rawLabel": "空腹血糖", "value": 5.2, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0},
]

MOCK_REPORT_DATE = "2026-01-15"


def _first_env(*names: str) -> Optional[str]:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def get_vision_status() -> Dict[str, Any]:
    api_key = _first_env("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY")
    base_url = _first_env(
        "VISION_LLM_BASE_URL", "OCR_LLM_BASE_URL", "OPENAI_BASE_URL", "LLM_BASE_URL",
    ) or "https://open.bigmodel.cn/api/paas/v4"
    model = _first_env("VISION_LLM_MODEL", "OCR_LLM_MODEL", "OPENAI_MODEL", "LLM_MODEL") or "glm-4v-flash"
    fallback_model = _first_env("VISION_LLM_FALLBACK_MODEL")
    return {
        "engine": "multimodal-vision",
        "available": True,  # 引擎为纯 HTTP 调用，依赖即 fastapi/httpx/pymupdf，可导入即可用
        "api_key_configured": bool(api_key),
        "base_url": base_url.rstrip("/"),
        "model": model,
        "fallback_model": fallback_model,
        "timeout_sec": max(10, int(os.getenv("VISION_LLM_TIMEOUT_SEC", os.getenv("OCR_LLM_TIMEOUT_SEC", "60")))),
        "max_output_tokens": _resolve_max_output_tokens(model),
        "max_pdf_pages": MAX_PDF_PAGES,
    }


def _resolve_max_output_tokens(model: str) -> int:
    """按模型取默认 max_tokens：GLM-4V-Flash 上限 1024，其他模型 2000。"""
    value = int(os.getenv("VISION_LLM_MAX_OUTPUT_TOKENS", os.getenv("OCR_LLM_MAX_OUTPUT_TOKENS", "0")))
    if value > 0:
        return max(400, value)
    return 1024 if "glm-4v-flash" in model.lower() else 2000


def _normalize_unit(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace("µ", "u")
        .replace("μ", "u")
        .replace("×", "x")
        .replace("＊", "*")
        .replace("／", "/")
        .replace(" ", "")
    )


def _normalize_label(value: str) -> str:
    return re.sub(r"[\s_：:()（）[\]【】{}<>《》,，、;；/\\|+\-.]+", "", value.strip().lower())


_REF_RANGE_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[-~～至]\s*(\d+(?:\.\d+)?)"
)


def _fix_decimal_shift(value: float, reference_range: str) -> Optional[float]:
    """OCR 常见错误：小数点错位（145 读成 14.5）。

    若识别值落在参考范围外，而 ×10 或 ÷10 后恰好落入范围内，则自动校正。
    合法的超标/偏低值（如尿酸 486 ↑）不受影响。
    """
    if not reference_range:
        return None
    match = _REF_RANGE_RE.search(reference_range)
    if not match:
        return None
    low, high = float(match.group(1)), float(match.group(2))
    if low <= 0 or high <= low:
        return None
    if low <= value <= high:
        return None
    if low <= value * 10 <= high:
        return round(value * 10, 6)
    if low <= value / 10 <= high:
        return round(value / 10, 6)
    return None


def _normalize_report_date(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    patterns = [
        r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})",
        r"(\d{4})\s*(\d{1,2})\s*(\d{1,2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            year, month, day = match.groups()
            return f"{year}-{int(month):02d}-{int(day):02d}"
    return ""


def _strip_code_fences(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_first_json_object(value: str) -> Optional[str]:
    text = _strip_code_fences(value)
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for index, char in enumerate(text[start:], start=start):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return None


class VisionEngineError(RuntimeError):
    """模型调用失败，message 面向用户（中文）。"""


class VisionEngine:
    """图片直发多模态模型的薄代理引擎。"""

    def __init__(self, use_mock: bool = False) -> None:
        self.use_mock = use_mock
        self.refresh_config()

    def refresh_config(self) -> None:
        status = get_vision_status()
        self.runtime_config = status
        self.base_url = str(status["base_url"])
        self.model = str(status["model"])
        self.fallback_model = status.get("fallback_model")
        self.timeout_sec = int(status["timeout_sec"])
        self.max_output_tokens = int(status["max_output_tokens"])
        self.api_key = _first_env("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY") or ""

    def parse_pdf(self, content: bytes, filename: str) -> Dict[str, Any]:
        """入口：接收 PDF 或图片字节，返回与原解析引擎相同结构的结果。"""
        if self.use_mock:
            return self._mock_result(filename)

        lower = (filename or "").lower()
        is_pdf = lower.endswith(".pdf") or "application/pdf" in (filename or "")
        if is_pdf:
            pages = self._render_pdf_pages(content)
        else:
            mime = "image/png" if lower.endswith(".png") else "image/jpeg"
            pages = [(mime, content)]

        if not pages:
            return {
                "success": False, "pageCount": 0, "reportDate": None,
                "tables": [], "indicators": [], "markdown": "",
                "error": "无法从文件中读取到页面内容",
            }
        if all(len(blob) < 1000 for _, blob in pages):
            return {
                "success": False, "pageCount": len(pages), "reportDate": None,
                "tables": [], "indicators": [], "markdown": "",
                "error": "文件内容为空或已损坏，请重新拍照/导出后再试",
            }
        if len(pages) > MAX_PDF_PAGES:
            pages = pages[:MAX_PDF_PAGES]

        indicators: List[Dict[str, Any]] = []
        report_date = ""
        chunk_size = MAX_IMAGES_PER_REQUEST
        try:
            for start in range(0, len(pages), chunk_size):
                chunk = pages[start:start + chunk_size]
                payload = self._request_structured_json(chunk, page_offset=start)
                normalized = self._normalize_result(payload, page_count=len(pages))
                indicators.extend(normalized["indicators"])
                report_date = report_date or normalized["reportDate"]
        except VisionEngineError:
            raise
        except Exception as exc:  # 防御：任何意外错误转为用户可读信息
            logger.exception("vision_parse_unexpected_error")
            raise VisionEngineError(f"报告解析失败：{exc}") from exc

        deduped = self._dedupe(indicators, page_count=len(pages))
        markdown_lines = [f"- {item['rawLabel']}：{item['value']} {item['unit']}（参考 {item['referenceRange'] or '无'}）" for item in deduped]
        return {
            "success": True,
            "pageCount": len(pages),
            "reportDate": report_date or None,
            "tables": [],
            "indicators": deduped,
            "markdown": "\n".join(markdown_lines),
            "error": None,
        }

    # ------------------------------------------------------------------
    def _render_pdf_pages(self, content: bytes) -> List[tuple]:
        try:
            import pymupdf as fitz  # PyMuPDF（新版本推荐入口）
        except ImportError:
            try:
                import fitz  # 旧版本 PyMuPDF
            except ImportError as exc:  # pragma: no cover
                raise VisionEngineError("服务端缺少 PDF 渲染依赖（PyMuPDF）") from exc
        pages: List[tuple] = []
        with fitz.open(stream=content, filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE))
                pages.append(("image/png", pix.tobytes("png")))
        return pages

    def _request_structured_json(self, images: List[tuple], *, page_offset: int) -> Dict[str, Any]:
        if not self.api_key:
            raise VisionEngineError(
                "模型服务未配置 API Key：请设置 VISION_LLM_API_KEY 环境变量后重试"
            )
        content: List[Dict[str, Any]] = []
        for index, (mime, blob) in enumerate(images):
            data_url = f"data:{mime};base64,{base64.b64encode(blob).decode('ascii')}"
            content.append({"type": "image_url", "image_url": {"url": data_url}})
        content.append({
            "type": "text",
            "text": f"{USER_INSTRUCTION}\n（本次提供第 {page_offset + 1} 至 {page_offset + len(images)} 张图片，pageIndex 请以本次第一张为 {page_offset} 计）",
        })

        models = [self.model]
        if self.fallback_model and self.fallback_model != self.model:
            models.append(self.fallback_model)

        last_error: Optional[str] = None
        for model in models:
            try:
                return self._call_chat_completions(model, content)
            except VisionEngineError as exc:
                last_error = str(exc)
                logger.warning("vision_model_call_failed model=%s error=%s", model, exc)
        raise VisionEngineError(last_error or "模型服务调用失败")

    def _call_chat_completions(self, model: str, content: List[Dict[str, Any]]) -> Dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        body: Dict[str, Any] = {
            "model": model,
            "temperature": 0,
            "max_tokens": self.max_output_tokens,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            "response_format": {"type": "json_object"},
        }
        try:
            response = httpx.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=self.timeout_sec,
            )
        except httpx.TimeoutException as exc:
            raise VisionEngineError(
                f"模型服务响应超时（>{self.timeout_sec}s），请稍后重试"
            ) from exc
        except httpx.HTTPError as exc:
            raise VisionEngineError("无法连接模型服务，请检查网络后重试") from exc

        if response.status_code == 401:
            raise VisionEngineError("模型服务鉴权失败：请检查 VISION_LLM_API_KEY 是否正确")
        if response.status_code == 429:
            raise VisionEngineError("模型服务限流或额度不足，请稍后重试")
        if response.status_code >= 400:
            text = response.text[:500]
            logger.error("vision_api_error status=%s body=%s", response.status_code, text)
            raise VisionEngineError(f"模型服务返回错误（HTTP {response.status_code}），请稍后重试")

        payload = response.json()
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise VisionEngineError("模型服务返回数据格式错误（缺少 choices）")
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise VisionEngineError("模型服务返回数据格式错误（缺少 message）")
        if isinstance(message.get("refusal"), str) and message["refusal"].strip():
            raise VisionEngineError(f"模型拒绝处理该内容：{message['refusal'].strip()}")

        content_text = message.get("content")
        if isinstance(content_text, list):
            parts = [
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in content_text
            ]
            content_text = "\n".join(part for part in parts if part)
        if not isinstance(content_text, str) or not content_text.strip():
            raise VisionEngineError("模型未返回可解析内容")

        text = _strip_code_fences(content_text)
        json_text = _extract_first_json_object(text) or text
        try:
            parsed = json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise VisionEngineError("模型返回的内容无法解析为 JSON") from exc
        if not isinstance(parsed, dict):
            raise VisionEngineError("模型返回的 JSON 结构不符合预期")
        return parsed

    @staticmethod
    def _adapt_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """格式适配：部分模型会无视 schema，把指标组织成以指标名为 key 的字典
        （{"空腹血糖": {"result": "5.3", ...}}）。统一转换为标准数组结构。"""
        if isinstance(payload.get("indicators"), list):
            return payload
        indicators: List[Dict[str, Any]] = []
        for key, value in payload.items():
            if not isinstance(value, dict):
                continue
            raw_value = value.get("result", value.get("value"))
            indicators.append({
                "rawLabel": key,
                "value": raw_value,
                "unit": value.get("unit", ""),
                "referenceRange": value.get("referenceRange", value.get("range", "")),
                "pageIndex": value.get("pageIndex", 0),
            })
        return {"reportDate": payload.get("reportDate", ""), "indicators": indicators}

    def _normalize_result(self, payload: Dict[str, Any], *, page_count: int) -> Dict[str, Any]:
        payload = self._adapt_payload(payload)
        raw_indicators = payload.get("indicators")
        if not isinstance(raw_indicators, list):
            raw_indicators = []
        raw_indicators = [
            item for item in raw_indicators
            if isinstance(item, dict) and "rawLabel" in item
        ]
        # value 可能藏在 result 字段（字符串或数字），归一化前先拍平
        for item in raw_indicators:
            if "value" not in item and "result" in item:
                item["value"] = item["result"]
        indicators: List[Dict[str, Any]] = []
        for item in raw_indicators:
            if not isinstance(item, dict):
                continue
            label = str(item.get("rawLabel", "")).strip()
            if not label:
                continue
            if any(keyword in label.lower() for keyword in METADATA_KEYWORDS):
                continue
            try:
                value = float(item.get("value"))
            except (TypeError, ValueError):
                continue
            if not math.isfinite(value):
                continue
            unit = str(item.get("unit", "")).strip()
            reference_range = str(item.get("referenceRange", "")).strip()
            try:
                page_index = int(item.get("pageIndex", 0))
            except (TypeError, ValueError):
                page_index = 0
            page_index = max(0, page_index)
            if page_count > 0:
                page_index = min(page_index, page_count - 1)
            indicators.append({
                "rawLabel": label,
                "value": value,
                "unit": unit,
                "referenceRange": reference_range,
                "pageIndex": page_index,
            })
        for item in indicators:
            corrected = _fix_decimal_shift(item["value"], item["referenceRange"])
            if corrected is not None and corrected != item["value"]:
                logger.info(
                    "value_decimal_shift_corrected label=%s %s -> %s (ref %s)",
                    item["rawLabel"], item["value"], corrected, item["referenceRange"],
                )
                item["value"] = corrected

        return {
            "reportDate": _normalize_report_date(payload.get("reportDate")),
            "indicators": indicators,
        }

    def _dedupe(self, indicators: List[Dict[str, Any]], *, page_count: int) -> List[Dict[str, Any]]:
        seen = set()
        result: List[Dict[str, Any]] = []
        for item in indicators:
            key = (
                item["pageIndex"],
                _normalize_label(item["rawLabel"]),
                round(item["value"], 6),
                _normalize_unit(item["unit"]),
                item["referenceRange"].strip().lower(),
            )
            if key in seen:
                continue
            seen.add(key)
            result.append(item)
        return result

    def _mock_result(self, filename: str) -> Dict[str, Any]:
        logger.info("vision_mock_result filename=%s", filename)
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": MOCK_REPORT_DATE,
            "tables": [],
            "indicators": [dict(item) for item in MOCK_INDICATORS],
            "markdown": "\n".join(
                f"- {item['rawLabel']}：{item['value']} {item['unit']}（参考 {item['referenceRange']}）"
                for item in MOCK_INDICATORS
            ),
            "error": None,
        }
