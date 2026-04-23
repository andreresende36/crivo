#!/bin/bash
# Rastrear uso de tokens por sessão
# Requer: jq instalado (brew install jq / apt install jq)
STATS_FILE="memory/session-stats.jsonl"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
# Ler do dashboard do Claude Code (se disponível)
# Caso contrário, registrar manualmente
echo "=== Session Stats ==="
echo "Date: $DATE $TIME"
echo ""
# Perguntar ao usuário (interativo)
read -p "Input tokens this session (estimado): " INPUT_TOKENS
read -p "Output tokens this session (estimado): " OUTPUT_TOKENS
read -p "Tasks completed: " TASKS_DONE
read -p "Context re-explanations needed (0-5): " RE_EXPLAIN
read -p "Rule violations caught by hooks (0-N): " VIOLATIONS
# Salvar em JSONL para análise posterior
cat >> "$STATS_FILE" << EOF
{"date":"$DATE","time":"$TIME","input_tokens":$INPUT_TOKENS,"output_tokens":$OUTPUT_TOKENS,"tasks_done":$TASKS_
DONE,"re_explanations":$RE_EXPLAIN,"hook_violations":$VIOLATIONS}
EOF
echo ""
echo "[v] Stats saved to $STATS_FILE"
echo ""
# Mostrar médias das últimas 10 sessões
if [ -f "$STATS_FILE" ] && command -v jq &> /dev/null; then
  echo "=== Last 10 Sessions Average ==="
  tail -10 "$STATS_FILE" | jq -s '
{
avg_input: (map(.input_tokens) | add / length),
avg_output: (map(.output_tokens) | add / length),
avg_tasks: (map(.tasks_done) | add / length),
total_sessions: length
}
'
fi
