import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BILL_MONTHS, parseMonthlyBillInputs } from "../monthlyBills";
import { loadMonthlyBills, saveMonthlyBills } from "../propertyApi";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function BillsModal({ year, savedAmounts, onCancel, onSave }: {
  year: number;
  savedAmounts: number[] | null;
  onCancel: () => void;
  onSave: (amounts: number[]) => Promise<void>;
}) {
  const [values, setValues] = useState(() => BILL_MONTHS.map((_, index) =>
    savedAmounts ? savedAmounts[index].toFixed(2) : ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { firstInput.current?.focus(); }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !saving) { event.preventDefault(); onCancel(); }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let amounts: number[];
    try { amounts = parseMonthlyBillInputs(values); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check the bill amounts."); return; }
    setSaving(true);
    try { await onSave(amounts); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save monthly bills."); }
    finally { setSaving(false); }
  }

  return <div className="bill-modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving) onCancel();
  }}>
    <div className="bill-modal" role="dialog" aria-modal="true" aria-labelledby="bill-modal-title"
      ref={dialog} onKeyDown={handleKeyDown}>
      <h2 id="bill-modal-title">Enter Monthly Electricity Bills</h2>
      <p>Enter actual historical USD bills for {year}. An empty month saves as $0.00.</p>
      <form onSubmit={submit} noValidate>
        <div className="bill-modal-grid">
          {BILL_MONTHS.map((month, index) => <label key={month}>{month}
            <span className="bill-currency-input"><span aria-hidden="true">$</span>
              <input ref={index === 0 ? firstInput : undefined} type="text" inputMode="decimal"
                aria-label={`${month} bill (USD)`} value={values[index]} disabled={saving}
                onChange={(event) => setValues((previous) => previous.map((value, position) =>
                  position === index ? event.target.value : value))} />
            </span>
          </label>)}
        </div>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="bill-modal-actions">
          <button type="button" className="bill-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>;
}

export function HistoricalBillsPanel({ propertyId }: { propertyId: string | null }) {
  const [yearText, setYearText] = useState(String(new Date().getFullYear() - 1));
  const [billsState, setBillsState] = useState<{ year: number; amounts: number[] | null } | null>(null);
  const [loading, setLoading] = useState(Boolean(propertyId));
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const year = /^\d{4}$/u.test(yearText) && Number(yearText) >= 1900
    && Number(yearText) <= new Date().getFullYear() ? Number(yearText) : null;
  const hasLoaded = year !== null && billsState?.year === year;
  const bills = hasLoaded ? billsState?.amounts ?? null : null;

  useEffect(() => {
    if (!propertyId || year === null) return;
    let active = true;
    setLoading(true);
    setError("");
    setBillsState(null);
    void loadMonthlyBills(propertyId, year).then((result) => {
      if (active) { setBillsState({ year, amounts: result.monthlyAmounts }); setLoading(false); }
    }).catch((cause: unknown) => {
      if (active) { setError(cause instanceof Error ? cause.message : "Could not load monthly bills."); setLoading(false); }
    });
    return () => { active = false; };
  }, [propertyId, year, retry]);

  function closeModal() { setModalOpen(false); trigger.current?.focus(); }

  async function save(amounts: number[]) {
    if (!propertyId || year === null) return;
    const result = await saveMonthlyBills(propertyId, year, amounts);
    setBillsState({ year, amounts: result.monthlyAmounts });
    closeModal();
  }

  const max = bills ? Math.max(...bills) : 0;
  return <section className="section-card historical-bills-panel" aria-labelledby="historical-bills-title">
    <h2 id="historical-bills-title">Historical Electricity Bill &amp; Solar Value</h2>
    <p className="muted">Manually entered historical bills. Solar value is not calculated yet.</p>
    {!propertyId ? <p>Load a property to enter historical bills.</p> : <>
      <div className="bill-toolbar">
        <label>Bill year<input type="number" min="1900" max={new Date().getFullYear()} step="1"
          value={yearText} onChange={(event) => { setYearText(event.target.value); setModalOpen(false); }} /></label>
        <button ref={trigger} type="button" disabled={year === null || !hasLoaded || loading || Boolean(error)}
          onClick={() => setModalOpen(true)}>Enter Monthly Bills</button>
      </div>
      {year === null && <p role="alert" className="error-message">Choose a valid historical bill year.</p>}
      {loading && <p role="status">Loading historical bills…</p>}
      {error && <div><p role="alert" className="error-message">{error}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry loading</button></div>}
      {!loading && !error && hasLoaded && !bills && <p>No monthly bills saved for {year}.</p>}
      {!loading && !error && hasLoaded && bills && <>
        <h3>Historical Electricity Bill (USD)</h3>
        <div className="bill-chart" role="img" aria-label={BILL_MONTHS.map((month, index) =>
          `${month}: ${usd.format(bills[index])}`).join(", ")}>
          {BILL_MONTHS.map((month, index) => <div className="bill-column" key={month} data-month={month}
            title={`${month}: ${usd.format(bills[index])}`}>
            <div className="bill-bar-area"><div className="bill-bar" data-amount={bills[index]}
              style={{ height: `${max === 0 ? 0 : bills[index] / max * 100}%` }} /></div>
            <abbr title={month}>{month.slice(0, 3)}</abbr>
          </div>)}
        </div>
      </>}
      {modalOpen && year !== null && <BillsModal year={year} savedAmounts={bills}
        onCancel={closeModal} onSave={save} />}
    </>}
  </section>;
}
