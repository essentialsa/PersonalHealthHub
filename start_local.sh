# ============================================
# 本地开发环境一键启动：OCR 后端 + 前端
# 用法：./start_local.sh          （无 API key 时自动进入 mock 模式）
#       VISION_LLM_API_KEY=xxx ./start_local.sh   （真实 GLM 识别）
# ============================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# OCR 后端：优先用项目 venv
PYBIN="$SCRIPT_DIR/report-parser/.venv/bin/python"
if [ ! -x "$PYBIN" ]; then
  echo "❌ 未找到 report-parser/.venv，请先运行: cd report-parser && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

if [ -z "$VISION_LLM_API_KEY" ]; then
  # .env 里如果配了 key 也自动带上
  if [ -f "$SCRIPT_DIR/.env" ]; then
    KEY_LINE=$(grep -E "^VISION_LLM_API_KEY=." "$SCRIPT_DIR/.env" | head -1 | cut -d= -f2-)
    if [ -n "$KEY_LINE" ]; then
      export VISION_LLM_API_KEY="$KEY_LINE"
      echo "🔑 已从 .env 读取 VISION_LLM_API_KEY，OCR 使用真实模型（GLM-4V-Flash）"
    fi
  fi
fi
if [ -z "$VISION_LLM_API_KEY" ]; then
  export USE_MOCK=true
  echo "⚠️  未配置 VISION_LLM_API_KEY，OCR 后端以 USE_MOCK 模式启动（返回固定样例数据）"
else
  echo "🚀 OCR 后端：真实模式，模型 ${VISION_LLM_MODEL:-glm-4v-flash}"
fi

# 清理端口占用
lsof -ti :8000 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null

echo "▶️  启动 OCR 后端: http://localhost:8000 （API 文档 /docs）"
(cd "$SCRIPT_DIR/report-parser" && "$PYBIN" -m uvicorn main:app --port 8000 > /tmp/ph-ocr.log 2>&1) &

for i in $(seq 1 20); do
  curl -sf -o /dev/null http://localhost:8000/api/healthz && break
  sleep 0.5
done
curl -s http://localhost:8000/api/healthz | head -c 200 && echo ""

echo "▶️  启动前端: http://localhost:5173"
cd "$SCRIPT_DIR"
node node_modules/vite/bin/vite.js --port 5173
