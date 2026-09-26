import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./propertyApi", async (original) => ({
  ...await original<typeof import("./propertyApi")>(),
  listAnalysisRuns: vi.fn().mockResolvedValue([]),
}));

describe("App", () => {
  it("redirects unknown routes to Analyze", () => {
    render(<MemoryRouter initialEntries={["/unknown"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /analyze property solar potential/i })).toBeInTheDocument();
  });

  it("renders the History empty state", async () => {
    render(<MemoryRouter initialEntries={["/history"]}><App /></MemoryRouter>);
    expect(await screen.findByText(/no saved analyses yet/i)).toBeInTheDocument();
  });
});
