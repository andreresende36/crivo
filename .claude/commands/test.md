Gere testes unitários completos para o código indicado.

## Escopo
$ARGUMENTS

## Protocolo

1. **Detecte** o test framework do projeto (vitest, jest, pytest, go test, etc.)
2. **Analise** cada função/classe:
   - Inputs (params, state, dependencies)
   - Outputs (return values, side effects, exceptions)
   - Branches (if/else, switch, guards, early returns)
3. **Gere** test cases mínimos:
   - ✅ Happy path (1 por função)
   - 🔲 Edge cases (empty, null, 0, max, boundary)
   - ❌ Error handling (invalid input, network failure, timeout)
   - 🔄 Async (se aplicável — promises, callbacks)

## Regras

- Test names descrevem COMPORTAMENTO: "should return user when valid ID"
- Um assert por test (ou asserts relacionados sobre o mesmo resultado)
- Mocks tipados e mínimos — mock apenas dependências externas
- Determinístico: sem time, random, network real
- Independência: cada test roda isolado, sem dependência entre tests

## Self-Healing

Após gerar os testes:
1. Rode: `npx vitest run [test-file]` ou equivalente
2. Se algum falhar → analise o erro → corrija → re-rode
3. Máximo 3 tentativas por test
4. Se persistir → marque como `test.skip` com comentário explicando

## Output

```
## Test Report
- Arquivo de test: [path]
- Total tests: N
- ✅ Passing: N
- Coverage estimada: N%
```
