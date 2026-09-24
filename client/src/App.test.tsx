import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("redirects unknown routes to Analyze", () => {
    render(<MemoryRouter initialEntries={["/unknown"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /analyze property solar potential/i })).toBeInTheDocument();
  });

  it("renders the History empty state", () => {
    render(<MemoryRouter initialEntries={["/history"]}><App /></MemoryRouter>);
    expect(screen.getByText(/no saved analyses yet/i)).toBeInTheDocument();
  });
});
