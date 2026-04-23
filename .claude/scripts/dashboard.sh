#!/bin/bash
# Gerar relatório de produtividade baseado nos journals
JOURNAL_DIR="memory/journal"
DECISIONS_DIR="memory/decisions"
echo "================================================"
echo " CLAUDE CODE ELITE — PRODUCTIVITY DASHBOARD"
echo " Generated: $(date)"
echo "================================================"
echo ""
# Contar journals
JOURNAL_COUNT=$(ls "$JOURNAL_DIR"/*.md 2> /dev/null | wc -l)
echo "Sessions journaled: $JOURNAL_COUNT"
# Contar decisões
DECISION_COUNT=$(ls "$DECISIONS_DIR"/*.md 2> /dev/null | wc -l)
echo "Architectural decisions documented: $DECISION_COUNT"
# Contar TODOs completos vs pendentes
DONE=$(grep -r "\[x\]" "$JOURNAL_DIR" 2> /dev/null | wc -l)
PENDING=$(grep -r "\[ \]" "$JOURNAL_DIR" 2> /dev/null | wc -l)
echo "Tasks completed: $DONE"
echo "Tasks pending: $PENDING"
# Calcular completion rate
if [ $((DONE + PENDING)) -gt 0 ]; then
  RATE=$(echo "scale=1; $DONE * 100 / ($DONE + $PENDING)" | bc)
  echo "Completion rate: $RATE%"
fi
echo ""
echo "=== Recent Decisions (last 5) ==="
ls -t "$DECISIONS_DIR"/*.md 2> /dev/null | head -5 | while read f; do
  echo " • $(basename $f)"
  head -3 "$f" | tail -1 # Segunda linha geralmente tem o título da decisão
done
echo ""
echo "=== Files Changed Most (top 10) ==="
git log --format="" --name-only 2> /dev/null \
  | grep -E "\.(ts|tsx|js|jsx)$" \
  | sort | uniq -c | sort -rn | head -10 \
  | awk '{print " "$1"x "$2}'
