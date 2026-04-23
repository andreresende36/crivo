Revise o código indicado abaixo.

## Escopo
$ARGUMENTS

## Análise Obrigatória (5 dimensões)

### 1. Bugs & Correção
- Erros de lógica, null/undefined, race conditions
- Off-by-one, comparações erradas, casos não tratados

### 2. Performance
- O(n²)+ evitável, memory leaks, N+1 queries
- Re-renders (React), bundle size, lazy loading ausente

### 3. Segurança
- Injection (SQL, XSS, command), secrets hardcoded
- Input não validado, IDOR, missing auth checks

### 4. Qualidade
- Naming descritivo, DRY, single responsibility
- Funções > 30 linhas, classes > 300 linhas, dead code

### 5. Convenções do Projeto
- Segue o CLAUDE.md do projeto (se existir)
- Import ordering, naming case, file structure

## Output

Para cada finding:
```
[🔴 CRITICAL | 🟡 WARNING | 🔵 INFO | ⚪ NITPICK] path/file:line
Problema: ...
Fix sugerido: [código concreto]
```

Resumo final:
| Dimensão | Score | Findings |
|----------|-------|----------|
| Bugs | ✅/⚠️/❌ | N |
| Performance | ✅/⚠️/❌ | N |
| Segurança | ✅/⚠️/❌ | N |
| Qualidade | ✅/⚠️/❌ | N |
| Convenções | ✅/⚠️/❌ | N |

**Veredito:** ✅ Aprovado | ⚠️ Aprovar com ressalvas | ❌ Bloqueia merge
