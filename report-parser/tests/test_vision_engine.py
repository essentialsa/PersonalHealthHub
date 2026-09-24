"""VisionEngine 单测：mock 模式、归一化、请求构造、错误分支（不访问真实模型服务）。"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


def make_engine(monkeypatch=None, **env):
    os.environ["USE_MOCK"] = "false"
    for key in (
        "VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY",
        "VISION_LLM_FALLBACK_API_KEY",
    ):
        os.environ.pop(key, None)
    if monkeypatch:
        for key, value in env.items():
            monkeypatch.setenv(key, value)
    from parser.vision_engine import VisionEngine
    return VisionEngine(use_mock=False)


def test_mock_mode_returns_structured_result():
    from parser.vision_engine import VisionEngine
    engine = VisionEngine(use_mock=True)
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["success"] is True
    assert result["pageCount"] == 1
    assert len(result["indicators"]) == 3
    assert result["reportDate"] == "2026-01-15"
    assert all(i["pageIndex"] == 0 for i in result["indicators"])
    # mock 模式下各条指标都携带检验分组示例
    assert all(i["reportCategory"] for i in result["indicators"])
    assert result["indicators"][2]["reportCategory"] == "血糖"


def test_missing_api_key_raises_user_facing_error():
    engine = make_engine()
    with pytest.raises(Exception) as exc_info:
        engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert "API Key" in str(exc_info.value)


def test_request_construction_and_success(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self):
            return {
                "choices": [{"message": {"content": json.dumps({
                    "reportDate": "2026年1月15日",
                    "indicators": [
                        {"rawLabel": "白细胞(WBC)", "value": "6.5", "unit": "×10^9/L",
                         "referenceRange": "3.5-9.5", "pageIndex": 0},
                        {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L",
                         "referenceRange": "3.5-9.5", "pageIndex": 0},
                        {"rawLabel": "报告日期", "value": 20260115, "unit": "", "referenceRange": "", "pageIndex": 0},
                        {"rawLabel": "坏值", "value": "abc", "unit": "", "referenceRange": "", "pageIndex": 0},
                    ],
                })}}],
            }

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key", VISION_LLM_MODEL="glm-4v-flash")
    png = base64.b64encode(b"fakepng" + b"\x00" * 2000).decode("ascii")
    result = engine.parse_pdf(png.encode(), "report.png")

    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["model"] == "glm-4v-flash"
    assert captured["body"]["messages"][1]["content"][0]["type"] == "image_url"
    assert captured["body"]["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/png;base64,")

    assert result["success"] is True
    assert result["reportDate"] == "2026-01-15"
    # 归一化：字符串数值转数字、同指标去重、元数据行与坏值剔除
    assert len(result["indicators"]) == 1
    assert result["indicators"][0]["rawLabel"] == "白细胞(WBC)"
    assert result["indicators"][0]["value"] == 6.5
    assert result["indicators"][0]["pageIndex"] == 0


def test_report_category_passthrough(monkeypatch):
    """模型输出带 reportCategory 时透传到解析结果。"""

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "谷丙转氨酶(ALT)", "value": 30, "unit": "U/L",
                     "referenceRange": "9-50", "reportCategory": "肝功能", "pageIndex": 0},
                ],
            })}}]}

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["success"] is True
    assert result["indicators"][0]["reportCategory"] == "肝功能"


def test_report_category_missing_or_invalid_defaults_to_empty(monkeypatch):
    """模型输出缺 reportCategory 字段或类型异常时，解析结果该字段为空字符串。"""

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    # 缺 reportCategory 字段
                    {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L",
                     "referenceRange": "3.5-9.5", "pageIndex": 0},
                    # reportCategory 为非字符串类型
                    {"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L",
                     "referenceRange": "3.9-6.1", "reportCategory": 123, "pageIndex": 0},
                ],
            })}}]}

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["success"] is True
    assert result["indicators"][0]["reportCategory"] == ""
    assert result["indicators"][1]["reportCategory"] == ""


def test_timeout_maps_to_user_facing_error(monkeypatch):
    import parser.vision_engine as ve

    def fake_post(url, headers=None, json=None, timeout=None):
        raise ve.httpx.TimeoutException("timeout")

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    with pytest.raises(Exception) as exc_info:
        engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert "超时" in str(exc_info.value)


def test_http_401_maps_to_api_key_error(monkeypatch):
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 401
        text = "unauthorized"
        def json(self):
            return {}

    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="bad-key")
    with pytest.raises(Exception) as exc_info:
        engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert "鉴权失败" in str(exc_info.value)


def test_fallback_model_used_on_primary_failure(monkeypatch):
    calls = []

    class RateLimitedResponse:
        status_code = 429
        text = "rate limited"
        def json(self):
            return {}

    class SuccessResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L",
                     "referenceRange": "3.9-6.1", "pageIndex": 0},
                ],
            })}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "auth": headers["Authorization"], "model": json["model"]})
        if "deepseek" in url:
            return RateLimitedResponse()
        return SuccessResponse()

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(
        monkeypatch,
        VISION_LLM_API_KEY="deepseek-key",
        VISION_LLM_FALLBACK_API_KEY="zhipu-key",
    )
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")

    # 主模型（DeepSeek）失败后自动切换备用（智谱），各自携带独立端点与凭证
    assert len(calls) == 2
    assert calls[0]["url"].startswith("https://api.deepseek.com/v1")
    assert calls[0]["auth"] == "Bearer deepseek-key"
    assert calls[1]["url"].startswith("https://open.bigmodel.cn/api/paas/v4")
    assert calls[1]["auth"] == "Bearer zhipu-key"
    assert calls[1]["model"] == "glm-4.6v-flash"

    assert result["success"] is True
    assert result["indicators"][0]["rawLabel"] == "空腹血糖"


def test_fallback_api_key_falls_back_to_primary(monkeypatch):
    import parser.vision_engine as ve
    for key in (
        "VISION_LLM_MODEL", "VISION_LLM_BASE_URL", "VISION_LLM_FALLBACK_MODEL",
        "VISION_LLM_FALLBACK_BASE_URL", "VISION_LLM_FALLBACK_API_KEY",
        "VISION_LLM_MAX_OUTPUT_TOKENS", "VISION_LLM_TIMEOUT_SEC",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("VISION_LLM_API_KEY", "primary-key")
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="primary-key")
    # 未设置 VISION_LLM_FALLBACK_API_KEY 时回落主凭证（单 provider 双模型场景）
    assert engine.fallback_api_key == "primary-key"
    assert engine.fallback_model == "glm-4.6v-flash"
    assert engine.fallback_base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert engine.model == "deepseek-flash"
    assert engine.base_url == "https://api.deepseek.com/v1"


def test_dual_provider_default_and_env_override(monkeypatch):
    from parser.vision_engine import get_vision_status, _resolve_max_output_tokens
    for key in (
        "VISION_LLM_MODEL", "VISION_LLM_BASE_URL", "VISION_LLM_FALLBACK_MODEL",
        "VISION_LLM_FALLBACK_BASE_URL", "VISION_LLM_FALLBACK_API_KEY",
        "VISION_LLM_MAX_OUTPUT_TOKENS", "OCR_LLM_MAX_OUTPUT_TOKENS",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("VISION_LLM_API_KEY", "k")

    status = get_vision_status()
    assert status["model"] == "deepseek-flash"
    assert status["base_url"] == "https://api.deepseek.com/v1"
    assert status["fallback_model"] == "glm-4.6v-flash"
    assert status["fallback_base_url"] == "https://open.bigmodel.cn/api/paas/v4"
    assert status["fallback_api_key_configured"] is True
    # 输出上限：默认 8192，glm-4v-flash 特判 1024
    assert status["max_output_tokens"] == 8192
    assert _resolve_max_output_tokens("glm-4v-flash") == 1024

    monkeypatch.setenv("VISION_LLM_MODEL", "custom-model")
    monkeypatch.setenv("VISION_LLM_FALLBACK_MODEL", "custom-fallback")
    monkeypatch.setenv("VISION_LLM_FALLBACK_BASE_URL", "https://custom.example/v1")
    monkeypatch.setenv("VISION_LLM_MAX_OUTPUT_TOKENS", "4000")
    status2 = get_vision_status()
    assert status2["model"] == "custom-model"
    assert status2["fallback_model"] == "custom-fallback"
    assert status2["fallback_base_url"] == "https://custom.example/v1"
    assert status2["max_output_tokens"] == 4000


def test_empty_result_raises_explicit_error(monkeypatch):
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "", "indicators": [],
            })}}]}

    monkeypatch.setattr(
        "parser.vision_engine.httpx.post", lambda *a, **k: FakeResponse(),
    )
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    with pytest.raises(Exception) as exc_info:
        engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    # 静默空结果被禁止：累计为空必须显式失败并给出可读原因
    assert "未识别到任何指标" in str(exc_info.value)


def test_partial_empty_page_returns_success(monkeypatch):
    """部分页空但累计非空：正常返回已识别指标（部分成功）。"""

    class FakeResponse:
        status_code = 200
        def __init__(self, indicators):
            self._indicators = indicators
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15", "indicators": self._indicators,
            })}}]}

    import parser.vision_engine as ve

    def fake_post(url, headers=None, json=None, timeout=None):
        # 通过请求体中的 page 文本区分页：第 0 页空、第 1 页有指标
        text_part = json["messages"][1]["content"][-1]["text"]
        if "第 1 至 1 张" in text_part:
            return FakeResponse([])
        return FakeResponse([
            {"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L",
             "referenceRange": "3.9-6.1", "pageIndex": 1},
        ])

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._render_pdf_pages = lambda content: [
        ("image/png", b"p0" + b"\x00" * 2000),
        ("image/png", b"p1" + b"\x00" * 2000),
    ]
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")
    assert result["success"] is True
    assert len(result["indicators"]) == 1
    assert result["indicators"][0]["pageIndex"] == 1


def test_deadline_budget_skips_remaining_pages(monkeypatch):
    """超过软性总预算时放弃剩余页，返回已解析的部分结果。"""
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L",
                     "referenceRange": "3.9-6.1", "pageIndex": 0},
                ],
            })}}]}

    post_calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        post_calls.append(json["model"])
        return FakeResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    # 假时钟：入口 0s，第 1 次页检查 10s（放行），第 2 次页检查 60s（超 55s 预算）
    clock = iter([0.0, 10.0, 60.0])
    monkeypatch.setattr(ve.time, "monotonic", lambda: next(clock))

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._render_pdf_pages = lambda content: [
        ("image/png", b"p0" + b"\x00" * 2000),
        ("image/png", b"p1" + b"\x00" * 2000),
    ]
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")

    # 第 2 页被预算跳过：只发生 1 次模型调用，但已解析页正常返回
    assert len(post_calls) == 1
    assert result["success"] is True
    assert len(result["indicators"]) == 1


def test_code_fence_json_extracted(monkeypatch):
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 200
        def json(self):
            content = "```json\n" + json.dumps({
                "reportDate": "", "indicators": [
                    {"rawLabel": "ALT", "value": 25, "unit": "U/L", "referenceRange": "9-50", "pageIndex": 0},
                ]
            }) + "\n```"
            return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["indicators"][0]["rawLabel"] == "ALT"


def test_decimal_shift_correction():
    from parser.vision_engine import _fix_decimal_shift
    # 145 读成 14.5，×10 落入参考范围 → 校正
    assert _fix_decimal_shift(14.5, "130-175") == 145.0
    # 合法超标值（尿酸 486 ↑）不受影响
    assert _fix_decimal_shift(486, "208-428") is None
    # 合法偏低值不受影响
    assert _fix_decimal_shift(45, "130-175") is None
    # ÷10 方向：0.5 读成 5.0，参考 0.51-1.09 → 0.5？不，5/10=0.5 略低于下限，不校正
    assert _fix_decimal_shift(5.0, "0.51-1.09") is None
    # 无参考范围/无法解析的范围不处理
    assert _fix_decimal_shift(14.5, "") is None
    assert _fix_decimal_shift(14.5, "升高") is None
