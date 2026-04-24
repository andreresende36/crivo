/**
 * Smoke tests — utilities usadas no painel admin.
 * Estes testes validam lógica pura (sem DOM, sem Supabase).
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Intl.NumberFormat pt-BR usa U+00A0 (non-breaking space) entre símbolo e valor
const normalizePrice = (s: string) => s.replace(/\u00a0/g, " ");

describe("formatPrice", () => {
  it("formata inteiro", () => {
    expect(normalizePrice(formatPrice(1299))).toBe("R$ 1.299,00");
  });

  it("formata decimal", () => {
    expect(normalizePrice(formatPrice(99.9))).toBe("R$ 99,90");
  });

  it("formata zero", () => {
    expect(normalizePrice(formatPrice(0))).toBe("R$ 0,00");
  });
});

// ---------------------------------------------------------------------------
// formatDiscount
// ---------------------------------------------------------------------------

function formatDiscount(pct: number): string {
  return `${Math.round(pct)}% OFF`;
}

describe("formatDiscount", () => {
  it("arredonda percentual", () => {
    expect(formatDiscount(33.7)).toBe("34% OFF");
  });

  it("zero desconto", () => {
    expect(formatDiscount(0)).toBe("0% OFF");
  });
});
