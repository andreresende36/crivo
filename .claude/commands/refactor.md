Refatore o código indicado aplicando boas práticas.

## Escopo
$ARGUMENTS

## Protocolo Seguro

### Pre-Flight
1. Identifique testes existentes → rode → DEVEM estar GREEN
2. Se NÃO existem testes → crie testes mínimos ANTES de refatorar

### Análise de Code Smells
Identifique na ordem de prioridade:
- **Long Method** (>30 lines) → Extract Function
- **God Class** (>300 lines / >5 responsibilities) → Split
- **Duplicate Code** → Extract + Reuse
- **Feature Envy** → Move Method
- **Primitive Obsession** → Value Objects / Enums
- **Deep Nesting** (>3 levels) → Early Return / Guard Clause
- **Magic Numbers** → Named Constants
- **Dead Code** → Remove

### Execução
Para CADA refactoring:
1. Aplique UMA mudança atômica
2. Rode testes → confirme GREEN
3. Se RED → reverta → tente abordagem alternativa
4. Próxima mudança

## Regras

- Preserve comportamento (mesma funcionalidade, melhor estrutura)
- Nomes descritivos (50% do valor de um refactoring está nos nomes)
- NUNCA misture refactoring com nova feature
- Uma mudança por passo — sem mega-refactorings

## Output

```
## Refactoring Report
- Code smells encontrados: [lista com localização]
- Refactorings aplicados: [lista com before → after resumido]
- Testes: ✅ All green (antes e depois)
- Complexidade: antes X → depois Y
```
