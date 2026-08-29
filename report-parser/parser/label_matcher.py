"""未匹配指标的免费模型语义匹配：用户指标库清单 + 未命中名称 → 建议映射。

与 vision_engine 共用同一套 VISION_LLM_* 环境变量（默认 glm-4v-flash，免费），
纯文本调用，无图片。模型只做"建议"，前端仍要求人工确认后应用。
"""
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("medical-report-label-matcher")

SYSTEM_PROMPT = """
你是中文体检指标命名匹配助手。用户维护了一个体检指标库，现在有一些 OCR 识别出的
未匹配指标名称，请把每个名称对齐到指标库中语义相同（或同一指标的不同写法）的条目。

严格遵守以下规则：
1. 只做语义对齐：同名不同写法（全半角、括号、简称、前后缀差异，如"血清甘油三酯"对
   "甘油三酯"、"载脂蛋白A1"对"载脂蛋白A-I"）才算匹配。
2. 不确定就返回 null，绝不猜；语义不同的指标（如"白细胞"对"白细胞酯酶"）必须返回 null。
3. 只在给定的 catalog 里选，不得编造新条目。
4. label 原样返回输入的名称，不要改写。
5. 只返回一个 JSON 对象，格式：
   {"matches": [{"label": "输入名称", "catalogId": "条目id或null", "catalogLabel": "条目名或null"}]}
""".strip()


def _first_env(*names: str) -> Optional[str]:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def get_label_matcher_status() -> Dict[str, Any]:
    api_key = _first_env("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY")
    base_url = _first_env(
        "VISION_LLM_BASE_URL", "OCR_LLM_BASE_URL", "OPENAI_BASE_URL", "LLM_BASE_URL",
    ) or "https://open.bigmodel.cn/api/paas/v4"
    model = _first_env("VISION_LLM_MODEL", "OCR_LLM_MODEL", "OPENAI_MODEL", "LLM_MODEL") or "glm-4v-flash"
    return {
        "api_key_configured": bool(api_key),
        "base_url": base_url.rstrip("/"),
        "model": model,
        "timeout_sec": max(10, int(os.getenv("VISION_LLM_TIMEOUT_SEC", os.getenv("OCR_LLM_TIMEOUT_SEC", "30")))),
    }


def _strip_code_fences(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _normalize_label(value: str) -> str:
    return re.sub(r"[\s_：:()（）[\]【】{}<>《》,，、;；/\\|+\-.]+", "", value.strip().lower())


class LabelMatcherError(RuntimeError):
    """匹配调用失败，message 面向用户（中文）。"""


def match_labels(
    labels: List[str],
    catalog: List[Dict[str, Any]],
    *,
    use_mock: bool = False,
) -> List[Dict[str, Any]]:
    if use_mock:
        return [
            {"label": label, "catalogId": None, "catalogLabel": None}
            for label in labels
        ]

    status = get_label_matcher_status()
    api_key = _first_env("VISION_LLM_API_KEY", "OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY")
    if not api_key:
        raise LabelMatcherError("模型服务未配置 API Key：请设置 VISION_LLM_API_KEY 环境变量")

    catalog_text = "\n".join(f"- {entry['id']}: {entry['label']}" for entry in catalog)
    labels_text = "\n".join(f"- {label}" for label in labels)
    user_message = (
        f"指标库清单（id: 名称）：\n{catalog_text}\n\n"
        f"未匹配指标名称：\n{labels_text}\n\n"
        "请输出匹配结果 JSON。"
    )

    body: Dict[str, Any] = {
        "model": status["model"],
        "temperature": 0,
        "max_tokens": min(1024, max(200, len(labels) * 40)),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "response_format": {"type": "json_object"},
    }

    try:
        response = httpx.post(
            f"{status['base_url']}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=status["timeout_sec"],
        )
    except httpx.TimeoutException as exc:
        raise LabelMatcherError("模型服务响应超时，请稍后重试") from exc
    except httpx.HTTPError as exc:
        raise LabelMatcherError("无法连接模型服务，请检查网络后重试") from exc

    if response.status_code in (401, 403):
        raise LabelMatcherError("模型服务鉴权失败：请检查 VISION_LLM_API_KEY 是否正确")
    if response.status_code == 429:
        raise LabelMatcherError("模型服务限流或额度不足，请稍后重试")
    if response.status_code >= 400:
        logger.error("label_matcher_api_error status=%s body=%s", response.status_code, response.text[:300])
        raise LabelMatcherError(f"模型服务返回错误（HTTP {response.status_code}），请稍后重试")

    payload = response.json()
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise LabelMatcherError("模型服务返回数据格式错误")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        content = "\n".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    if not isinstance(content, str) or not content.strip():
        raise LabelMatcherError("模型未返回可解析内容")

    text = _strip_code_fences(content)
    start = text.find("{")
    json_text = text[start:] if start >= 0 else text
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise LabelMatcherError("模型返回的内容无法解析为 JSON") from exc

    raw_matches = parsed.get("matches") if isinstance(parsed, dict) else None
    if not isinstance(raw_matches, list):
        raise LabelMatcherError("模型返回的 JSON 结构不符合预期")

    # 归一化：只保留请求中出现过的 label；catalogId 必须真实存在于 catalog
    valid_ids = {str(entry["id"]): entry for entry in catalog}
    requested = {label for label in labels}
    matches: List[Dict[str, Any]] = []
    for item in raw_matches:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        if label not in requested:
            continue
        catalog_id = item.get("catalogId")
        catalog_label = item.get("catalogLabel")
        if isinstance(catalog_id, str) and catalog_id in valid_ids:
            matches.append({
                "label": label,
                "catalogId": catalog_id,
                "catalogLabel": str(catalog_label or valid_ids[catalog_id]["label"]),
            })
        else:
            matches.append({"label": label, "catalogId": None, "catalogLabel": None})
    return matches
