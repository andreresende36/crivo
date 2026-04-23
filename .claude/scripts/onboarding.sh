#!/bin/bash
# Executar uma vez quando um novo dev clona o projeto
set -e

echo "=== Claude Code Elite — Team Onboarding ==="
echo ""

# 1. Verificar que Claude Code está instalado
if ! command -v claude &> /dev/null; then
  echo "[X] Claude Code not found. Install: npm install -g @anthropic-ai/claude-code"
  exit 1
fi
echo "[v] Claude Code installed: $(claude --version)"

# 2. Criar memória pessoal local
if [ ! -f "memory/wake-up.md" ]; then
  mkdir -p memory/journal memory/decisions
  cat > memory/wake-up.md << 'EOF'
# Wake-Up — (first session)
## Project Status
[Just onboarded. Run: git log --oneline -10 to see recent changes]
## What I Know So Far
[Fill this in after first session]
## My First Task
[Ask the team what to start with]
EOF
  echo "[v] Created personal memory/wake-up.md"
else
  echo "[v] memory/wake-up.md already exists"
fi

# 3. Verificar permissões dos hooks
if chmod +x .claude/hooks/*.sh 2> /dev/null; then
  echo "[v] Hook permissions set"
else
  echo "[!] Could not set hook permissions (no hooks found?)"
fi

# 4. Instalar dependências do projeto raiz
if [ -f "package.json" ]; then
  if npm install --silent; then
    echo "[v] Root dependencies installed"
  else
    echo "[X] Failed to install root dependencies"
    exit 1
  fi
fi

# 5. Build dos MCP servers (instalados via workspaces no passo 4)
if [ -d ".claude/mcp-servers" ]; then
  if npm run mcp:build --silent; then
    echo "[v] MCP servers built"
  else
    echo "[X] Failed to build MCP servers"
    exit 1
  fi
fi

# 6. Indexar o projeto
if [ -f "package.json" ] && grep -q "claude:index" package.json; then
  if npm run claude:index --silent; then
    echo "[v] Project indexed for MCP context"
  else
    echo "[!] Project indexing failed — check if 'src/' exists and tsx is installed"
  fi
fi

echo ""
echo "=== Onboarding Complete ==="
echo "Start your first session: claude"
echo "Your context will be loaded automatically from memory/wake-up.md"
