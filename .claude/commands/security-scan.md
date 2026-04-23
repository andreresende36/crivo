Execute auditoria de segurança no código do projeto.

## Escopo
$ARGUMENTS

Se nenhum escopo foi especificado, analise o projeto inteiro.

## Varredura Completa

### 1. Secret Scanning
Busque padrões:
- `sk-[a-zA-Z0-9]{20,}` (OpenAI)
- `AKIA[0-9A-Z]{16}` (AWS)
- `ghp_[a-zA-Z0-9]{36}` (GitHub)
- `sk_live_[a-zA-Z0-9]+` (Stripe)
- `password\s*=\s*['"][^'"]+['"]` (hardcoded passwords)
- `.env` files in git history

### 2. Injection
- **SQL:** `query(.*\${` / `execute(.*+` / `raw(` sem parameterization
- **XSS:** `innerHTML` / `dangerouslySetInnerHTML` / `v-html` / user input em HTML
- **Command:** `exec(` / `spawn(` / `execSync(` com user input

### 3. Auth & Access Control
- Endpoints sem middleware de auth
- IDOR (acesso a resources via ID sem ownership check)
- Missing role/permission checks
- JWT sem verificação de expiração

### 4. Dependencies
```bash
npm audit --json 2>/dev/null || pip-audit --format json 2>/dev/null
```

### 5. Configuration
- Debug mode habilitado em produção
- CORS com `*` (allow-all)
- Security headers ausentes (CSP, HSTS, X-Frame-Options)
- API keys em client-side code

## Output

```
## 🔒 Security Audit Report

### Risk Score: [CRITICAL | HIGH | MEDIUM | LOW]

### Findings (por severidade)
🔴 CRITICAL: [finding + PoC + fix]
🟡 HIGH: [finding + PoC + fix]
🔵 MEDIUM: [finding + fix]
⚪ LOW: [finding + recommendation]

### Dependency Vulnerabilities
[npm audit / pip-audit results]

### Top 3 Ações Prioritárias
1. [Mais urgente]
2. [Segundo]
3. [Terceiro]
```
