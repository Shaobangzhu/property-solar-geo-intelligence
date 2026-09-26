import { describe, expect, it, vi } from "vitest";
import { createPropertyNavigation } from "./propertyNavigation";

const first = { id: "first", displayAddress: "First property", latitude: 34, longitude: -117 };
const second = { id: "second", displayAddress: "Second property", latitude: 35, longitude: -118 };

describe("property camera navigation", () => {
  it("cancels an earlier property move and keeps the latest target", async () => {
    const calls: Array<{ id: string; signal: AbortSignal }> = [];
    const navigate = vi.fn(async (property: typeof first, signal: AbortSignal) => {
      calls.push({ id: property.id, signal });
    });
    const onError = vi.fn();
    const navigation = createPropertyNavigation(navigate, onError);

    navigation.move(first);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    navigation.move(second);
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].id).toBe("second");
    expect(calls[1].signal.aborted).toBe(false);
    navigation.dispose();
    expect(calls[1].signal.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores expected cancellation and reports a navigation failure", async () => {
    const onError = vi.fn();
    const cancelled = createPropertyNavigation(
      async () => { throw new DOMException("Cancelled", "AbortError"); }, onError,
    );
    cancelled.move(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).not.toHaveBeenCalled();

    const failed = createPropertyNavigation(async () => { throw new Error("Camera failed"); }, onError);
    failed.move(second);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    cancelled.dispose();
    failed.dispose();
  });

  it("does not start a superseded move when properties change in the same tick", async () => {
    const navigate = vi.fn(async () => undefined);
    const navigation = createPropertyNavigation(navigate, vi.fn());
    navigation.move(first);
    navigation.move(second);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenCalledWith(second, expect.any(AbortSignal));
    navigation.dispose();
  });

  it("ignores a late camera failure after the view is disposed", async () => {
    let rejectMove: ((error: Error) => void) | undefined;
    const onError = vi.fn();
    const navigation = createPropertyNavigation(() => new Promise((_resolve, reject) => {
      rejectMove = reject;
    }), onError);

    navigation.move(first);
    await vi.waitFor(() => expect(rejectMove).toBeDefined());
    navigation.dispose();
    rejectMove?.(new Error("View was destroyed"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).not.toHaveBeenCalled();
  });
});
