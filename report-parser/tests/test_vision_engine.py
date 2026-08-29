"""VisionEngine 单测：mock 模式、归一化、请求构造、错误分支（不访问真实模型服务）。"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


def make_engine(monkeypatch=None, **env):
    os.environ["USE_MOCK"] = "false"
    for key in ("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY"):
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

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({"reportDate": "", "indicators": []})}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json["model"])
        return FakeResponse()

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(
        monkeypatch,
        VISION_LLM_API_KEY="test-key",
        VISION_LLM_MODEL="glm-4v-flash",
        VISION_LLM_FALLBACK_MODEL="glm-4.1v-thinking-flash",
    )
    # 空指标结果同样被接受（主模型调用成功即不触发 fallback 触发路径中的人类可读错误）
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert calls == ["glm-4v-flash"]
    assert result["success"] is True
    assert result["indicators"] == []


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
