Execute checklist de deploy para o ambiente indicado.

## Ambiente
$ARGUMENTS

Se não especificado, assume production.

## Pre-Deploy Checklist

### 1. Build
```bash
npm run build 2>&1 || python -m py_compile main.py
```
- [ ] Build succeeded (zero errors)
- [ ] Warnings revisados (nenhum crítico)

### 2. Tests
```bash
npm test 2>&1 || pytest 2>&1
```
- [ ] Todos os testes passando
- [ ] Coverage > 80% para código novo

### 3. Environment
- [ ] Variáveis de ambiente configuradas no target
- [ ] Secrets rotacionados se necessário
- [ ] `.env.example` atualizado

### 4. Database
- [ ] Migrations geradas e testadas
- [ ] Rollback migration testado
- [ ] Backup recente do banco

### 5. Security
- [ ] `npm audit` / `pip-audit` sem CRITICAL
- [ ] Debug mode OFF
- [ ] CORS restrito ao domínio do app
- [ ] Security headers presentes

### 6. Dependencies
- [ ] `package-lock.json` / `requirements.txt` atualizado
- [ ] Nenhuma dep deprecated sem substituto

## Deploy

Execute o deploy:
1. Identifique o método (Vercel, Docker, Railway, manual SSH)
2. Execute o deploy
3. Aguarde container/build healthy

## Post-Deploy Verification

1. **Health Check:** GET /health → 200
2. **Smoke Test:** teste manual do fluxo principal
3. **Logs:** primeiros 60s sem errors
4. **Metrics:** response time < threshold

## Se Falhar

```
1. Identifique: é rollback ou hotfix?
   - 500 errors / crash → ROLLBACK imediato
   - Bug menor / visual → HOTFIX pode ser ok
2. Rollback: deploy da versão anterior
3. Hotfix: fix → test → deploy → verify
```

## Output

```
## Deploy Report
- Ambiente: [staging/production]
- Versão: [tag/commit]
- Status: ✅ Success / ❌ Failed (+ rollback)
- Health: [HTTP status]
- Response time: [Xms]
```
