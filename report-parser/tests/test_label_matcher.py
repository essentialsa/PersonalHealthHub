"""label_matcher 单测：请求构造、响应归一化、容错与错误映射（不访问真实模型）。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


def make_matcher(monkeypatch, **env):
    for key in ("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY", "VISION_LLM_MODEL", "OCR_LLM_MODEL"):
        os.environ.pop(key, None)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import importlib
    from parser import label_matcher
    importlib.reload(label_matcher)
    return label_matcher


LABELS = ["血清甘油三酯", "白细胞"]
CATALOG = [
    {"id": "item_1", "label": "甘油三酯"},
    {"id": "item_2", "label": "白细胞计数"},
]


def ok_response(content):
    class R:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": content}}]}
    return R()


def test_mock_mode_returns_null_suggestions():
    from parser.label_matcher import match_labels
    matches = match_labels(LABELS, CATALOG, use_mock=True)
    assert matches == [
        {"label": "血清甘油三酯", "catalogId": None, "catalogLabel": None, "suggestedCategory": None},
        {"label": "白细胞", "catalogId": None, "catalogLabel": None, "suggestedCategory": None},
    ]


def test_missing_api_key_raises_user_facing_error(monkeypatch):
    lm = make_matcher(monkeypatch)
    with pytest.raises(lm.LabelMatcherError) as exc_info:
        lm.match_labels(LABELS, CATALOG)
    assert "API Key" in str(exc_info.value)


def test_request_construction_and_response_normalization(monkeypatch):
    captured = {}
    content = json.dumps({"matches": [
        {"label": "血清甘油三酯", "catalogId": "item_1", "catalogLabel": "甘油三酯"},
        {"label": "不存在的输入", "catalogId": "item_1", "catalogLabel": "甘油三酯"},
        {"label": "白细胞", "catalogId": "item_999", "catalogLabel": "伪造"},
        {"label": "白细胞", "catalogId": None, "catalogLabel": None},
    ]})
    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update({"url": url, "headers": headers, "body": json, "timeout": timeout})
        return ok_response(content)

    lm = make_matcher(monkeypatch, VISION_LLM_API_KEY="test-key")
    monkeypatch.setattr(lm.httpx, "post", fake_post)
    matches = lm.match_labels(LABELS, CATALOG)

    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["temperature"] == 0
    assert "血清甘油三酯" in captured["body"]["messages"][1]["content"]
    assert "item_1: 甘油三酯" in captured["body"]["messages"][1]["content"]

    # 请求外的 label 剔除；catalogId 不存在的降级为未匹配（保留条目）
    assert matches == [
        {"label": "血清甘油三酯", "catalogId": "item_1", "catalogLabel": "甘油三酯", "suggestedCategory": None},
        {"label": "白细胞", "catalogId": None, "catalogLabel": None, "suggestedCategory": None},
        {"label": "白细胞", "catalogId": None, "catalogLabel": None, "suggestedCategory": None},
    ]


def test_suggested_category_passthrough_on_hit_and_miss(monkeypatch):
    """响应带 suggestedCategory 时透传：命中与未命中两种都保留。"""
    content = json.dumps({"matches": [
        # 命中 catalog 条目 + 建议"血脂"
        {"label": "血清甘油三酯", "catalogId": "item_1", "catalogLabel": "甘油三酯",
         "suggestedCategory": "血脂"},
        # 未命中 + 建议"血常规"
        {"label": "白细胞", "catalogId": None, "catalogLabel": None,
         "suggestedCategory": "血常规"},
    ]})
    lm = make_matcher(monkeypatch, VISION_LLM_API_KEY="test-key")
    monkeypatch.setattr(lm.httpx, "post", lambda *a, **k: ok_response(content))
    matches = lm.match_labels(LABELS, CATALOG)
    assert matches[0]["catalogId"] == "item_1"
    assert matches[0]["suggestedCategory"] == "血脂"
    assert matches[1]["catalogId"] is None
    assert matches[1]["suggestedCategory"] == "血常规"


def test_suggested_category_invalid_values_become_none(monkeypatch):
    """suggestedCategory 为异常类型（数字/空串）时置 None。"""
    content = json.dumps({"matches": [
        {"label": "血清甘油三酯", "catalogId": "item_1", "catalogLabel": "甘油三酯",
         "suggestedCategory": 123},
        {"label": "白细胞", "catalogId": None, "catalogLabel": None,
         "suggestedCategory": "   "},
    ]})
    lm = make_matcher(monkeypatch, VISION_LLM_API_KEY="test-key")
    monkeypatch.setattr(lm.httpx, "post", lambda *a, **k: ok_response(content))
    matches = lm.match_labels(LABELS, CATALOG)
    assert matches[0]["suggestedCategory"] is None
    assert matches[1]["suggestedCategory"] is None


def test_code_fence_and_timeout(monkeypatch):
    content = "```json\n" + json.dumps({"matches": [{"label": "血清甘油三酯", "catalogId": "item_1", "catalogLabel": "甘油三酯"}]}) + "\n```"
    lm = make_matcher(monkeypatch, VISION_LLM_API_KEY="test-key")
    monkeypatch.setattr(lm.httpx, "post", lambda *a, **k: ok_response(content))
    matches = lm.match_labels(LABELS, CATALOG)
    assert matches[0]["catalogId"] == "item_1"

    monkeypatch.setattr(lm.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(lm.httpx.TimeoutException("t")))
    with pytest.raises(lm.LabelMatcherError) as exc_info:
        lm.match_labels(LABELS, CATALOG)
    assert "超时" in str(exc_info.value)
