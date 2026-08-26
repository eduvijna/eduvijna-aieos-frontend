import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeJsonPayload } from "./SafeJsonPayload";

describe("D. Detail safe payload", () => {
  it("renders nested JSON without HTML injection", () => {
    const { container } = render(
      <SafeJsonPayload
        payload={{
          title: "<script>alert(1)</script>",
          nested: { ok: true, n: 3 },
          list: ["a", "b"],
        }}
      />,
    );

    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
