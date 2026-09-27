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
    # mock 模式下各条指标都携带异常标记示例（空腹血糖偏高）
    assert all("abnormalFlag" in i for i in result["indicators"])
    assert result["indicators"][0]["abnormalFlag"] == ""
    assert result["indicators"][2]["abnormalFlag"] == "H"


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

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "body": json, "timeout": timeout})
        return FakeResponse()

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key", VISION_LLM_MODEL="glm-4v-flash")
    png = base64.b64encode(b"fakepng" + b"\x00" * 2000).decode("ascii")
    result = engine.parse_pdf(png.encode(), "report.png")

    # 首个请求为视觉解析；后续（如有）为医生复核纯文本调用
    captured = calls[0]
    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["model"] == "glm-4v-flash"
    assert captured["body"]["messages"][1]["content"][0]["type"] == "image_url"
    assert captured["body"]["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/png;base64,")
    # 预算充足时追加医生复核：纯文本请求，视觉 payload 无 issues → review 为空清单
    assert len(calls) == 2
    assert isinstance(calls[1]["body"]["messages"][1]["content"], str)
    assert result["review"] == {"issues": []}

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


def test_abnormal_flag_normalization(monkeypatch):
    """模型输出 abnormalFlag 的多种写法归一化为 H/L；缺字段/非字符串归为空。"""

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "血红蛋白", "value": 158, "unit": "g/L",
                     "referenceRange": "130-175", "abnormalFlag": "↑", "pageIndex": 0},
                    {"rawLabel": "谷丙转氨酶(ALT)", "value": 62, "unit": "U/L",
                     "referenceRange": "9-50", "abnormalFlag": "H", "pageIndex": 0},
                    {"rawLabel": "血小板", "value": 95, "unit": "×10^9/L",
                     "referenceRange": "125-350", "abnormalFlag": "low", "pageIndex": 0},
                    {"rawLabel": "白蛋白", "value": 38, "unit": "g/L",
                     "referenceRange": "40-55", "abnormalFlag": "偏低", "pageIndex": 0},
                    {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L",
                     "referenceRange": "3.5-9.5", "pageIndex": 0},
                    {"rawLabel": "红细胞", "value": 4.8, "unit": "×10^12/L",
                     "referenceRange": "4.3-5.8", "abnormalFlag": 1, "pageIndex": 0},
                ],
            })}}]}

    import parser.vision_engine as ve
    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["success"] is True
    assert result["indicators"][0]["abnormalFlag"] == "H"
    assert result["indicators"][1]["abnormalFlag"] == "H"
    assert result["indicators"][2]["abnormalFlag"] == "L"
    assert result["indicators"][3]["abnormalFlag"] == "L"
    # 缺字段与非字符串类型均为空字符串
    assert result["indicators"][4]["abnormalFlag"] == ""
    assert result["indicators"][5]["abnormalFlag"] == ""


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
    assert calls[0]["url"].startswith("https://api.deepseek.com/v1")
    assert calls[0]["auth"] == "Bearer deepseek-key"
    assert calls[1]["url"].startswith("https://open.bigmodel.cn/api/paas/v4")
    assert calls[1]["auth"] == "Bearer zhipu-key"
    assert calls[1]["model"] == "glm-4.6v-flash"
    # 第 3 次为医生复核纯文本调用（主模型 429）→ 复核降级，不影响主结果
    assert len(calls) == 3
    assert calls[2]["url"].startswith("https://api.deepseek.com/v1")
    assert calls[2]["model"] == "deepseek-flash"

    assert result["success"] is True
    assert result["indicators"][0]["rawLabel"] == "空腹血糖"
    assert "review" not in result


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
        if isinstance(json["messages"][1]["content"], str):
            return FakeResponse([])  # 医生复核纯文本调用：无 issues → 空清单
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
    engine._open_pdf = lambda content: (
        2, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")
    assert result["success"] is True
    assert len(result["indicators"]) == 1
    assert result["indicators"][0]["pageIndex"] == 1


def _chunk_offset_from_body(body):
    """从请求体的提示文本解析本次 chunk 的 page_offset（'本次提供第 N 至 M 张图片'）。"""
    import re
    text_part = body["messages"][1]["content"][-1]["text"]
    match = re.search(r"本次提供第 (\d+) 至", text_part)
    return int(match.group(1)) - 1


def test_deadline_budget_skips_remaining_pages(monkeypatch):
    """并行实现下超过软性总预算：首批 chunk 提交后停止提交剩余 chunk，返回部分结果。"""
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

    # 假时钟：入口 0s，第 1 个 chunk 提交前检查 10s（放行），
    # 第 2 个 chunk 提交前检查 60s（超 52s 预算，停止提交），60s 供日志复用。
    # 线程感知：worker 线程内的预算时钟调用返回常量 10s（与提交时刻一致，剩余 42s 允许调用），
    # 主线程按脚本序列消费，避免并行实现下迭代器耗尽
    import threading
    main_id = threading.get_ident()
    clock = iter([0.0, 10.0, 60.0, 60.0])

    def fake_monotonic():
        return next(clock) if threading.get_ident() == main_id else 10.0

    monkeypatch.setattr(ve.time, "monotonic", fake_monotonic)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    # 6 页 = 2 个 chunk（4 页 + 2 页）：首个提交，第二个被预算拦下
    rendered: list = []

    def fake_open(content):
        def get_page(index):
            rendered.append(index)
            return ("image/png", f"p{index}".encode() + b"\x00" * 2000)
        return 6, get_page

    engine._open_pdf = fake_open
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")

    # 仅首批 1 个 chunk 发起模型调用，后 2 页被跳过；已解析部分正常返回
    assert len(post_calls) == 1
    assert result["success"] is True
    # pageCount 为本次解析页数（已覆盖区间），totalPages 为全文档页数
    assert result["pageCount"] == 4
    assert result["totalPages"] == 6
    assert len(result["indicators"]) == 1
    # 惰性渲染：超预算 chunk 的页（4/5）从未被渲染
    assert rendered == [0, 1, 2, 3]


def test_budget_returns_partial_with_parsed_range(monkeypatch):
    """超预算返回部分结果：parsedRange 表示已覆盖区间，供前端续段。"""
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

    monkeypatch.setattr(ve.httpx, "post", lambda *a, **k: FakeResponse())

    # 假时钟：入口 0s，第 1 个 chunk 提交前 10s（放行），
    # 第 2 个 chunk 提交前 60s（超 52s 预算停止）。
    # 线程感知：worker 线程的预算时钟调用返回常量 10s（剩余 42s 允许调用），主线程按脚本序列消费
    import threading
    main_id = threading.get_ident()
    clock = iter([0.0, 10.0, 60.0, 60.0])

    def fake_monotonic():
        return next(clock) if threading.get_ident() == main_id else 10.0

    monkeypatch.setattr(ve.time, "monotonic", fake_monotonic)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._open_pdf = lambda content: (
        6, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")

    assert result["success"] is True
    assert result["parsedRange"] == [0, 3]
    assert result["totalPages"] == 6
    assert result["pageCount"] == 4


def test_fallback_timeout_capped_by_remaining_budget(monkeypatch):
    """主模型超时后，备用模型调用的 timeout 被剩余预算封顶（杜绝 45+45=90s 链）。"""
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

    recorded = []

    def fake_post(url, headers=None, json=None, timeout=None):
        recorded.append((json["model"], timeout))
        if len(recorded) == 1:
            raise ve.httpx.TimeoutException("primary timeout")
        return FakeResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    # 线程感知假时钟：主线程 [入口 0s, 提交检查 10s, 复核预算检查 60s（剩余 -8 < 8 → 跳过复核）]；
    # worker 线程 [预算基准 10s（deadline=10+42=52）, 主模型剩余检查 10s（剩 42→timeout 42）,
    # 备用模型剩余检查 49s（剩 3→timeout 封顶 3）]
    import threading
    main_id = threading.get_ident()
    main_clock = iter([0.0, 10.0, 60.0])
    worker_clock = iter([10.0, 10.0, 49.0])

    def fake_monotonic():
        return next(main_clock) if threading.get_ident() == main_id else next(worker_clock)

    monkeypatch.setattr(ve.time, "monotonic", fake_monotonic)

    engine = make_engine(
        monkeypatch, VISION_LLM_API_KEY="test-key", VISION_LLM_FALLBACK_API_KEY="fb-key",
    )
    engine._open_pdf = lambda content: (4, lambda i: ("image/png", b"x" * 2000))
    result = engine.parse_pdf(b"fake", "r.pdf")

    assert result["success"] is True
    assert len(recorded) == 2
    assert recorded[0][1] == 42  # 主模型被剩余预算（52-10）封顶到 42s
    assert recorded[1][1] == 3   # 备用模型被剩余预算（52-49）封顶到 3s


def test_fallback_skipped_when_budget_exhausted(monkeypatch):
    """主模型超时且剩余预算不足 3s 时，备用模型调用被跳过，chunk 降级失败而非拖死 60s。"""
    import parser.vision_engine as ve

    def fake_post(url, headers=None, json=None, timeout=None):
        raise ve.httpx.TimeoutException("primary timeout")

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    import threading
    main_id = threading.get_ident()
    main_clock = iter([0.0, 10.0])
    # worker：预算基准 10s（deadline=52），主模型剩余检查 10s，备用剩余检查 50s（剩 2 < 3 跳过）
    worker_clock = iter([10.0, 10.0, 50.0])

    def fake_monotonic():
        return next(main_clock) if threading.get_ident() == main_id else next(worker_clock)

    monkeypatch.setattr(ve.time, "monotonic", fake_monotonic)

    engine = make_engine(
        monkeypatch, VISION_LLM_API_KEY="test-key", VISION_LLM_FALLBACK_API_KEY="fb-key",
    )
    engine._open_pdf = lambda content: (4, lambda i: ("image/png", b"x" * 2000))

    import pytest
    with pytest.raises(ve.VisionEngineError):
        engine.parse_pdf(b"fake", "r.pdf")


def test_page_range_slice(monkeypatch):
    """page_range 分段：只提交区间内的 chunk，指标页码为绝对值，返回区间元数据。"""
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 200
        def __init__(self, indicators):
            self._indicators = indicators
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15", "indicators": self._indicators,
            })}}]}

    recorded = []

    def fake_post(url, headers=None, json=None, timeout=None):
        body = json
        if isinstance(body["messages"][1]["content"], str):
            return FakeResponse([])  # 医生复核纯文本调用：无 issues → 空清单
        offset = _chunk_offset_from_body(body)
        recorded.append(offset)
        return FakeResponse([{
            "rawLabel": f"指标{offset}", "value": 1.0 + offset, "unit": "u",
            "referenceRange": "1-100", "reportCategory": "分组", "pageIndex": offset,
        }])

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    rendered: list = []

    def fake_open(content):
        def get_page(index):
            rendered.append(index)
            return ("image/png", f"p{index}".encode() + b"\x00" * 2000)
        return 23, get_page

    engine._open_pdf = fake_open
    result = engine.parse_pdf(b"fake-pdf", "report.pdf", page_range="8-19")

    # 区间 8-19 = 3 个 chunk（4页×3），只调用 8/12/16
    assert sorted(recorded) == [8, 12, 16]
    # 惰性渲染只渲染区间内的页
    assert rendered == [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]

    assert result["success"] is True
    assert result["parsedRange"] == [8, 19]
    assert result["totalPages"] == 23
    assert result["pageCount"] == 12
    # 指标 pageIndex 为绝对页码且落在区间内
    assert {item["pageIndex"] for item in result["indicators"]} == {8, 12, 16}
    assert all(8 <= item["pageIndex"] <= 19 for item in result["indicators"])


def test_page_range_invalid_raises(monkeypatch):
    """page_range 格式非法或起止倒置：显式报错，不静默忽略。"""
    from parser.vision_engine import VisionEngineError

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._open_pdf = lambda content: (
        6, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    for bad_range in ("abc", "5-2"):
        with pytest.raises(VisionEngineError):
            engine.parse_pdf(b"fake-pdf", "report.pdf", page_range=bad_range)


def test_all_pages_parsed_in_parallel(monkeypatch):
    """23 页全量解析：6 个 chunk（4页×5+3页）全部被调用，指标聚合并去重。"""
    import parser.vision_engine as ve

    LABELS = {
        0: "空腹血糖", 4: "谷丙转氨酶(ALT)", 8: "肌酐",
        12: "甘油三酯", 16: "促甲状腺激素", 20: "骨骼肌",
    }

    class FakeResponse:
        status_code = 200
        def __init__(self, indicators):
            self._indicators = indicators
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15", "indicators": self._indicators,
            })}}]}

    recorded = []

    def fake_post(url, headers=None, json=None, timeout=None):
        body = json
        if isinstance(body["messages"][1]["content"], str):
            return FakeResponse([])  # 医生复核纯文本调用：无 issues → 空清单
        offset = _chunk_offset_from_body(body)
        image_count = sum(
            1 for part in body["messages"][1]["content"] if part.get("type") == "image_url"
        )
        recorded.append({"offset": offset, "images": image_count})
        indicators = [{
            "rawLabel": LABELS[offset], "value": 1.0 + offset, "unit": "u",
            "referenceRange": "1-100", "reportCategory": "分组", "pageIndex": offset,
        }]
        if offset == 0:
            # 同一 chunk 内完全重复的指标行：去重后只保留一条
            indicators.append(dict(indicators[0]))
        return FakeResponse(indicators)

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._open_pdf = lambda content: (
        23, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")

    # 全部 6 个 chunk（offset 0/4/8/12/16/20）都被调用，末块 3 页
    assert sorted(item["offset"] for item in recorded) == [0, 4, 8, 12, 16, 20]
    by_offset = {item["offset"]: item["images"] for item in recorded}
    assert by_offset[0] == 4 and by_offset[16] == 4 and by_offset[20] == 3

    assert result["success"] is True
    assert result["pageCount"] == 23
    assert result["parsedRange"] == [0, 22]
    assert result["totalPages"] == 23
    # 6 个不同指标聚合，首块重复行被去重
    assert len(result["indicators"]) == 6
    assert {item["rawLabel"] for item in result["indicators"]} == set(LABELS.values())
    assert {item["pageIndex"] for item in result["indicators"]} == set(LABELS.keys())


def test_single_chunk_failure_degrades(monkeypatch):
    """单个 chunk 的模型调用失败（HTTP 500）时降级跳过，其余 chunk 结果保留。"""
    import parser.vision_engine as ve

    class ErrorResponse:
        status_code = 500
        text = "internal error"
        def json(self):
            return {}

    class SuccessResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "空腹血糖", "value": 5.3, "unit": "mmol/L",
                     "referenceRange": "3.9-6.1", "reportCategory": "血糖", "pageIndex": 0},
                    {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L",
                     "referenceRange": "3.5-9.5", "reportCategory": "血常规", "pageIndex": 2},
                ],
            })}}]}

    failed_offsets = []

    def fake_post(url, headers=None, json=None, timeout=None):
        if isinstance(json["messages"][1]["content"], str):
            return SuccessResponse()  # 医生复核纯文本调用：无 issues → 空清单
        offset = _chunk_offset_from_body(json)
        if offset == 4:
            failed_offsets.append(offset)
            return ErrorResponse()
        return SuccessResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    # 8 页 = 2 个 chunk：offset 0 成功，offset 4 失败
    engine._open_pdf = lambda content: (
        8, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    result = engine.parse_pdf(b"fake-pdf", "report.pdf")

    assert failed_offsets  # 失败 chunk 确实被请求过（含主备两次尝试）
    assert result["success"] is True
    # 失败 chunk 不计入已覆盖区间：仅首块 4 页成功
    assert result["parsedRange"] == [0, 3]
    assert result["pageCount"] == 4
    assert result["totalPages"] == 8
    assert len(result["indicators"]) == 2
    assert {item["rawLabel"] for item in result["indicators"]} == {"空腹血糖", "白细胞(WBC)"}


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


def test_parse_pdf_stream_emits_chunk_events(monkeypatch):
    """6 页 = 2 个 chunk：每完成一个 chunk yield chunk_done，结束 yield done，
    且 done.result 与同步入口 parse_pdf 的结果完全一致。"""
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 200
        def __init__(self, indicators):
            self._indicators = indicators
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15", "indicators": self._indicators,
            })}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        if isinstance(json["messages"][1]["content"], str):
            return FakeResponse([])  # 医生复核纯文本调用：无 issues → 空清单
        offset = _chunk_offset_from_body(json)
        return FakeResponse([{
            "rawLabel": f"指标{offset}", "value": 1.0 + offset, "unit": "u",
            "referenceRange": "1-100", "pageIndex": offset,
        }])

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    def fake_open(content):
        return 6, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._open_pdf = fake_open
    events = list(engine.parse_pdf_stream(b"fake-pdf", "report.pdf"))

    assert [e["event"] for e in events] == ["chunk_done", "chunk_done", "done"]
    # 进度事件：已覆盖页数右端 +1 / 全文档页数
    assert events[0]["parsed"] == 4 and events[0]["total"] == 6
    assert events[1]["parsed"] == 6 and events[1]["total"] == 6

    done_result = events[2]["result"]
    assert done_result["success"] is True
    assert done_result["pageCount"] == 6
    assert done_result["parsedRange"] == [0, 5]
    assert done_result["totalPages"] == 6
    assert len(done_result["indicators"]) == 2
    # done 事件的结果同样携带医生复核
    assert done_result["review"] == {"issues": []}

    # done.result 与同步入口结果完全一致
    engine._open_pdf = fake_open
    assert done_result == engine.parse_pdf(b"fake-pdf", "report.pdf")


def test_parse_pdf_stream_yields_error_event_on_total_failure(monkeypatch):
    """模型全失败：流式入口不上抛，而是 yield error 事件后结束。"""
    import parser.vision_engine as ve

    def fake_post(url, headers=None, json=None, timeout=None):
        raise ve.httpx.TimeoutException("timeout")

    monkeypatch.setattr(ve.httpx, "post", fake_post)

    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    engine._open_pdf = lambda content: (
        6, lambda index: ("image/png", f"p{index}".encode() + b"\x00" * 2000),
    )
    events = list(engine.parse_pdf_stream(b"fake-pdf", "report.pdf"))

    assert [e["event"] for e in events] == ["error"]
    assert "超时" in events[0]["error"]


def test_doctor_review_detects_issue_without_reread(monkeypatch):
    """复核发现高置信疑点（无 get_page 场景）：issues 原样保留，不触发重读。"""
    import parser.vision_engine as ve

    review_payload = {"issues": [{
        "label": "心率", "issue": "数值与单位量级矛盾", "suggestedValue": 125,
        "suggestedUnit": "次/分", "confidence": "high",
    }]}

    calls = []

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps(review_payload)}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"body": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    indicators = [{
        "rawLabel": "心率", "value": 1251, "unit": "cm/s",
        "referenceRange": "60-100", "abnormalFlag": "H", "pageIndex": 0,
    }]
    review = engine._doctor_review(indicators, 30.0)

    assert review == {"issues": [{
        "label": "心率", "issue": "数值与单位量级矛盾", "suggestedValue": 125,
        "suggestedUnit": "次/分", "confidence": "high",
    }]}
    # 仅一次纯文本调用：user content 为文本清单，超时 = min(20, 30-3)
    assert len(calls) == 1
    assert isinstance(calls[0]["body"]["messages"][1]["content"], str)
    assert "心率: 1251 cm/s" in calls[0]["body"]["messages"][1]["content"]
    assert calls[0]["timeout"] == 20


def test_doctor_review_skipped_when_budget_low(monkeypatch):
    """剩余预算不足 8s：不发文本请求，review 为 None。"""
    import parser.vision_engine as ve

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(url)
        raise AssertionError("预算不足时不应发起请求")

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    indicators = [{"rawLabel": "心率", "value": 80, "unit": "次/分",
                   "referenceRange": "60-100", "abnormalFlag": "", "pageIndex": 0}]
    assert engine._doctor_review(indicators, 7.9) is None
    assert calls == []

    # 解析流程内同样跳过：假时钟使复核预算检查时剩余 7s（52-45）
    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "心率", "value": 80, "unit": "次/分",
                     "referenceRange": "60-100", "pageIndex": 0},
                ],
            })}}]}

    post_calls = []

    def fake_post2(url, headers=None, json=None, timeout=None):
        post_calls.append(json["model"])
        return FakeResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post2)

    import threading
    main_id = threading.get_ident()
    clock = iter([0.0, 10.0, 45.0])

    def fake_monotonic():
        return next(clock) if threading.get_ident() == main_id else 10.0

    monkeypatch.setattr(ve.time, "monotonic", fake_monotonic)
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")
    assert result["success"] is True
    assert "review" not in result
    # 仅视觉解析 1 次调用，无复核文本请求
    assert len(post_calls) == 1


def test_doctor_review_degrades_on_timeout(monkeypatch):
    """复核文本调用超时：降级为无 review，主解析结果不受影响。"""
    import parser.vision_engine as ve

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "心率", "value": 1251, "unit": "cm/s",
                     "referenceRange": "60-100", "pageIndex": 0},
                ],
            })}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        if isinstance(json["messages"][1]["content"], str):
            raise ve.httpx.TimeoutException("review timeout")
        return FakeResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")

    assert result["success"] is True
    assert len(result["indicators"]) == 1
    assert "review" not in result


def test_parse_result_includes_review_issues(monkeypatch):
    """解析流程端到端：复核返回疑点时挂在 result['review']。"""
    import parser.vision_engine as ve

    class VisualResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "2026-01-15",
                "indicators": [
                    {"rawLabel": "总胆固醇", "value": 362, "unit": "mmol/L",
                     "referenceRange": "2.8-5.7", "pageIndex": 0},
                ],
            })}}]}

    class ReviewResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({"issues": [{
                "label": "总胆固醇", "issue": "数值与参考范围量级矛盾",
                "suggestedValue": 3.62, "suggestedUnit": None, "confidence": "medium",
            }]})}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        if isinstance(json["messages"][1]["content"], str):
            return ReviewResponse()
        return VisualResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    result = engine.parse_pdf(b"fake" + b"\x00" * 2000, "report.png")

    assert result["success"] is True
    assert result["review"]["issues"] == [{
        "label": "总胆固醇", "issue": "数值与参考范围量级矛盾",
        "suggestedValue": 3.62, "suggestedUnit": None, "confidence": "medium",
    }]


def test_doctor_review_high_issue_confirmed_by_reread(monkeypatch):
    """高置信疑点重读原页：重读值与建议值一致 → 确认（最终取重读值）。"""
    import parser.vision_engine as ve

    review_payload = {"issues": [{
        "label": "心率", "issue": "数值疑似串行", "suggestedValue": 125,
        "suggestedUnit": None, "confidence": "high",
    }]}

    class TextResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps(review_payload)}}]}

    class RereadResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "",
                "indicators": [
                    {"rawLabel": "心率", "value": 125, "unit": "次/分",
                     "referenceRange": "60-100", "pageIndex": 0},
                ],
            })}}]}

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json["messages"][1]["content"])
        if isinstance(json["messages"][1]["content"], str):
            return TextResponse()
        return RereadResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    indicators = [{
        "rawLabel": "心率", "value": 1251, "unit": "cm/s",
        "referenceRange": "60-100", "abnormalFlag": "", "pageIndex": 0,
    }]
    review = engine._doctor_review(
        indicators, 30.0, get_page=lambda index: ("image/png", b"x" * 2000),
    )

    # 第 1 次纯文本复核 + 第 2 次单页重读；确认后 confidence 保持 high，值为重读值
    assert len(calls) == 2
    assert isinstance(calls[0], str)
    assert review["issues"] == [{
        "label": "心率", "issue": "数值疑似串行", "suggestedValue": 125.0,
        "suggestedUnit": None, "confidence": "high",
    }]


def test_doctor_review_high_issue_downgraded_when_reread_disagrees(monkeypatch):
    """重读值与原值一致（不支持修正建议）：降级为 medium，仅提示不确认。"""
    import parser.vision_engine as ve

    review_payload = {"issues": [{
        "label": "心率", "issue": "数值疑似串行", "suggestedValue": 125,
        "suggestedUnit": None, "confidence": "high",
    }]}

    class TextResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps(review_payload)}}]}

    class RereadResponse:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "reportDate": "",
                "indicators": [
                    {"rawLabel": "心率", "value": 1251, "unit": "cm/s",
                     "referenceRange": "60-100", "pageIndex": 0},
                ],
            })}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        if isinstance(json["messages"][1]["content"], str):
            return TextResponse()
        return RereadResponse()

    monkeypatch.setattr(ve.httpx, "post", fake_post)
    engine = make_engine(monkeypatch, VISION_LLM_API_KEY="test-key")
    indicators = [{
        "rawLabel": "心率", "value": 1251, "unit": "cm/s",
        "referenceRange": "60-100", "abnormalFlag": "", "pageIndex": 0,
    }]
    review = engine._doctor_review(
        indicators, 30.0, get_page=lambda index: ("image/png", b"x" * 2000),
    )
    assert review["issues"][0]["confidence"] == "medium"
    assert review["issues"][0]["suggestedValue"] == 125


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
