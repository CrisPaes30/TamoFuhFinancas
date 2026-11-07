// src/components/stats/__tests__/Bar.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Bar from "@/components/stats/Bar";

function fillWidth(container: HTMLElement): string {
  const fill = container.querySelector(".overflow-hidden > div") as HTMLElement | null;
  return fill?.style.width ?? "";
}

describe("Bar — regressão do fix de piso 4%", () => {
  it("value=0 renderiza largura 0% (não mais 4%)", () => {
    const { container } = render(<Bar label="A" value={0} max={1000} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("0%");
  });

  it("value negativo também renderiza 0%", () => {
    const { container } = render(<Bar label="A" value={-50} max={1000} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("0%");
  });
});

describe("Bar — piso de 4% continua valendo para valores pequenos positivos", () => {
  it("value=1, max=1000 (0,1%) ainda aparece com 4% de piso", () => {
    const { container } = render(<Bar label="A" value={1} max={1000} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("4%");
  });
});

describe("Bar — escala normal", () => {
  it("value===max renderiza 100%", () => {
    const { container } = render(<Bar label="A" value={500} max={500} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("100%");
  });

  it("value>max não quebra (overflow-hidden no container clipa visualmente, largura pode passar de 100%)", () => {
    const { container } = render(<Bar label="A" value={150} max={100} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("150%");
    const track = container.querySelector(".overflow-hidden") as HTMLElement;
    expect(track.className).toContain("overflow-hidden");
  });

  it("max=0 explícito cai no fallback max||1, sem NaN/Infinity", () => {
    const { container } = render(<Bar label="A" value={2} max={0} color="bg-emerald-500" />);
    const w = fillWidth(container);
    expect(w).not.toContain("NaN");
    expect(w).not.toContain("Infinity");
    expect(w).toBe("200%");
  });

  it("max=0 e value=0 não produz NaN (cai no ramo value<=0 => 0%)", () => {
    const { container } = render(<Bar label="A" value={0} max={0} color="bg-emerald-500" />);
    expect(fillWidth(container)).toBe("0%");
  });
});
