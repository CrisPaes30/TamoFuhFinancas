// src/components/stats/__tests__/StatBox.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatBox from "@/components/stats/StatBox";
import { fromCents } from "@/lib/currency";

function valueEl(container: HTMLElement): HTMLElement {
  return container.querySelector(".font-semibold") as HTMLElement;
}

describe("StatBox — cor por sinal quando emphasis=true", () => {
  it("value<0 usa classe rose", () => {
    const { container } = render(<StatBox label="Sobra/Falta" value={-500} emphasis />);
    expect(valueEl(container).className).toContain("rose");
  });

  it("value>=0 (incluindo 0) usa classe emerald", () => {
    const { container: c1 } = render(<StatBox label="Sobra/Falta" value={500} emphasis />);
    expect(valueEl(c1).className).toContain("emerald");

    const { container: c2 } = render(<StatBox label="Sobra/Falta" value={0} emphasis />);
    expect(valueEl(c2).className).toContain("emerald");
  });
});

describe("StatBox — sem emphasis", () => {
  it("usa classe slate-200 independente do sinal", () => {
    const { container: c1 } = render(<StatBox label="Renda" value={500} />);
    expect(valueEl(c1).className).toContain("slate-200");

    const { container: c2 } = render(<StatBox label="Renda" value={-500} />);
    expect(valueEl(c2).className).toContain("slate-200");
    expect(valueEl(c2).className).not.toContain("rose");
    expect(valueEl(c2).className).not.toContain("emerald");
  });
});

describe("StatBox — currency ausente", () => {
  it("usa BRL por padrão sem crash", () => {
    const { container } = render(<StatBox label="Renda" value={12345} />);
    expect(valueEl(container).textContent).toBe(fromCents(12345));
  });
});
