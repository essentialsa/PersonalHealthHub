"""API 测试"""
import os
import pytest
from fastapi.testclient import TestClient

os.environ["USE_MOCK"] = "true"

from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["engine_initialized"] is False


def test_healthz_is_lightweight():
    response = client.get("/api/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["ocr_ready"] is True
    assert data["engine_initialized"] is False


def test_parse_report_mock():
    # 使用 mock 文件测试
    import io
    response = client.post(
        "/api/parse",
        files={"file": ("test.pdf", io.BytesIO(b"fake pdf content" + b"\x00" * 2000), "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["indicators"]) > 0
    labels = {item["rawLabel"] for item in data["indicators"]}
    assert "收缩压" in labels


def test_parse_report_stream_sse():
    """stream=1：返回 text/event-stream，SSE 事件序列以 done 结束。"""
    import io
    import json
    response = client.post(
        "/api/parse?stream=1",
        files={"file": ("test.pdf", io.BytesIO(b"fake pdf content" + b"\x00" * 2000), "application/pdf")},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = [f for f in response.text.split("\n\n") if f.startswith("data: ")]
    events = [json.loads(frame[len("data: "):]) for frame in frames]
    assert len(events) >= 1
    assert events[-1]["event"] == "done"
    assert all(e["event"] in ("chunk_done", "done", "error") for e in events)
    assert events[-1]["result"]["success"] is True
    assert len(events[-1]["result"]["indicators"]) > 0


def test_parse_report_default_is_json():
    """不带 stream 参数：仍返回 JSON（行为不变）。"""
    import io
    response = client.post(
        "/api/parse",
        files={"file": ("test.pdf", io.BytesIO(b"fake pdf content" + b"\x00" * 2000), "application/pdf")},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["success"] is True


def test_parse_report_file_too_large():
    import io
    large_content = b"x" * (51 * 1024 * 1024)  # 51MB
    response = client.post(
        "/api/parse",
        files={"file": ("large.pdf", io.BytesIO(large_content), "application/pdf")}
    )
    assert response.status_code == 400
