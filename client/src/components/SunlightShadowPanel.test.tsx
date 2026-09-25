import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SunlightSettings } from "../sunlight";
import { SunlightShadowPanel } from "./SunlightShadowPanel";

const settings: SunlightSettings = {
  date: "2026-09-24",
  time: "12:00",
  utcOffsetHours: -7,
  shadowsEnabled: false,
};

describe("SunlightShadowPanel", () => {
  it("keeps controls disabled until a property is loaded", () => {
    const onChange = vi.fn();
    render(<SunlightShadowPanel propertyLoaded={false} hasRoofOutline={false} settings={settings} onChange={onChange} />);
    expect(screen.getByText("Load a property to explore sunlight and shadows.")).toBeInTheDocument();
    for (const name of ["Date", "Time", "UTC offset (hours)", "Show shadows"]) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits date, time, offset, and shadow setting changes", () => {
    const onChange = vi.fn();
    render(<SunlightShadowPanel propertyLoaded hasRoofOutline settings={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-21" } });
    expect(onChange).toHaveBeenCalledWith({ ...settings, date: "2026-12-21" });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "16:30" } });
    expect(onChange).toHaveBeenCalledWith({ ...settings, time: "16:30" });
    fireEvent.change(screen.getByLabelText("UTC offset (hours)"), { target: { value: "-8" } });
    expect(onChange).toHaveBeenCalledWith({ ...settings, utcOffsetHours: -8 });
    fireEvent.click(screen.getByLabelText("Show shadows"));
    expect(onChange).toHaveBeenCalledWith({ ...settings, shadowsEnabled: true });
    expect(screen.queryByText(/Draw a roof outline/)).not.toBeInTheDocument();
    expect(screen.getByText(/purple overlay shows accumulated shadow/)).toBeInTheDocument();
  });

  it("explains the outline requirement and keeps the shading assumption separate", () => {
    render(<SunlightShadowPanel propertyLoaded hasRoofOutline={false} settings={settings} onChange={vi.fn()} />);
    expect(screen.getByText(/Draw a roof outline in Map mode/)).toBeInTheDocument();
    expect(screen.getByText(/estimated shading factor remains a separate manual/)).toBeInTheDocument();
    expect(screen.getByText(/not treated as roof shadow casters/)).toBeInTheDocument();
  });

  it("shows invalid date, time, or offset as an input error", () => {
    const { rerender } = render(<SunlightShadowPanel propertyLoaded hasRoofOutline settings={{ ...settings, date: "2026-02-30" }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid date.");
    rerender(<SunlightShadowPanel propertyLoaded hasRoofOutline settings={{ ...settings, time: "25:00" }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a time");
    rerender(<SunlightShadowPanel propertyLoaded hasRoofOutline settings={{ ...settings, utcOffsetHours: 5.1 }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("UTC offset");
  });
});
