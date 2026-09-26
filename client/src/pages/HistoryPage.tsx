import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAnalysisRun, listAnalysisRuns, type AnalysisRunSummary } from "../propertyApi";

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const capacityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<AnalysisRunSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runToDelete, setRunToDelete] = useState<AnalysisRunSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const newAnalysisButton = useRef<HTMLButtonElement>(null);
  const restoreFocusPending = useRef(false);

  useEffect(() => {
    let active = true;
    void listAnalysisRuns().then((result) => {
      if (active) setRuns(result);
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause, "Could not load analysis history."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadGeneration]);

  useEffect(() => {
    if (runToDelete || !restoreFocusPending.current) return;
    const target = deleteTrigger.current?.isConnected ? deleteTrigger.current
      : filterInput.current?.isConnected ? filterInput.current : newAnalysisButton.current;
    target?.focus();
    restoreFocusPending.current = false;
  }, [runToDelete, runs]);

  useEffect(() => {
    if (deleting) dialogRef.current?.focus();
  }, [deleting]);

  const matchingRuns = runs.filter((run) => run.property.displayAddress
    .toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));

  function closeDeleteDialog() {
    restoreFocusPending.current = true;
    setRunToDelete(null);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !deleting) {
      event.preventDefault();
      closeDeleteDialog();
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (focusable.length === 0) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function confirmDelete() {
    if (!runToDelete || deleting) return;
    const id = runToDelete.id;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await deleteAnalysisRun(id);
      setRuns((previous) => previous.filter((run) => run.id !== id));
      setNotice("Analysis deleted.");
      closeDeleteDialog();
    } catch (cause) {
      const message = errorMessage(cause, "Could not delete this analysis.");
      if (/not found|already deleted|\b404\b/i.test(message)) {
        setRuns((previous) => previous.filter((run) => run.id !== id));
        setNotice("This analysis was already deleted.");
        closeDeleteDialog();
      } else {
        setError(message);
        closeDeleteDialog();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="history-title" className="page history-page">
      <div className="page-heading history-heading">
        <div>
          <p className="eyebrow">SAVED SCENARIOS</p>
          <h1 id="history-title">Analysis History</h1>
          <p>Revisit the property, roof assumptions, and production estimate saved with each analysis.</p>
        </div>
        <button className="history-new-button" ref={newAnalysisButton}
          onClick={() => navigate("/analyze")} type="button">
          New Analysis
        </button>
      </div>

      {error && <p className="error-message history-message" role="alert">{error}</p>}
      {notice && <p className="history-message" role="status">{notice}</p>}

      {loading ? (
        <section className="empty-state" role="status">Loading saved analyses…</section>
      ) : error && runs.length === 0 ? (
        <section className="empty-state history-load-error">
          <h2>Could not load analysis history</h2>
          <p>Check that the local server is running, then try again.</p>
          <button type="button" onClick={() => { setError(""); setLoading(true); setLoadGeneration((value) => value + 1); }}>
            Try Again
          </button>
        </section>
      ) : runs.length === 0 ? (
        <section className="empty-state">
          <h2>No saved analyses yet</h2>
          <p>Analyze a property, then select Save Analysis to add a run here.</p>
        </section>
      ) : (
        <section className="history-card" aria-label="Saved analyses">
          <div className="history-toolbar">
            <div>
              <h2>Saved analyses</h2>
              <p>{runs.length} {runs.length === 1 ? "run" : "runs"} saved</p>
            </div>
            <label className="history-filter">
              <span>Search by address</span>
              <input ref={filterInput} value={filter} onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter properties" type="search" />
            </label>
          </div>
          {matchingRuns.length === 0 ? (
            <div className="history-no-match" role="status">
              <strong>No matching analyses</strong>
              <p>Try a different property address.</p>
            </div>
          ) : (
            <div className="history-table-scroll">
              <table className="history-table">
                <thead><tr>
                  <th scope="col">Property</th>
                  <th scope="col">System Size</th>
                  <th scope="col">Annual Production</th>
                  <th scope="col">Estimated Annual Savings</th>
                  <th scope="col">Created At</th>
                  <th scope="col">Actions</th>
                </tr></thead>
                <tbody>{matchingRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="history-property">{run.property.displayAddress}</td>
                    <td>{capacityFormatter.format(run.systemCapacityKw)} kW</td>
                    <td>{integerFormatter.format(run.annualAcKwh)} kWh</td>
                    <td>{run.estimatedAnnualSavingsUsd == null
                      ? <span className="history-unavailable">Unavailable</span>
                      : <><strong>{currencyFormatter.format(run.estimatedAnnualSavingsUsd)}</strong>
                        <span className="history-estimate-label">ESTIMATE</span></>}</td>
                    <td><time dateTime={run.createdAt}>{formatCreatedAt(run.createdAt)}</time></td>
                    <td><div className="history-actions">
                      <button onClick={() => navigate(`/analyze?runId=${encodeURIComponent(run.id)}&mode=view`)}
                        type="button" aria-label={`View analysis for ${run.property.displayAddress}`}>View</button>
                      <button onClick={() => navigate(`/analyze?runId=${encodeURIComponent(run.id)}&mode=edit`)}
                        type="button" aria-label={`Edit analysis for ${run.property.displayAddress}`}>Edit</button>
                      <button className="history-delete-button" onClick={(event) => {
                        deleteTrigger.current = event.currentTarget; setRunToDelete(run); setError("");
                      }}
                        type="button" aria-label={`Delete analysis for ${run.property.displayAddress}`}>Delete</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {runToDelete && (
        <div className="history-dialog-backdrop">
          <div className="history-dialog" role="alertdialog" aria-modal="true" tabIndex={-1}
            ref={dialogRef} onKeyDown={handleDialogKeyDown}
            aria-labelledby="history-delete-title" aria-describedby="history-delete-description">
            <h2 id="history-delete-title">Delete this analysis?</h2>
            <p id="history-delete-description">
              The saved run for <strong>{runToDelete.property.displayAddress}</strong> will be removed from History.
            </p>
            <div className="history-dialog-actions">
              <button type="button" autoFocus disabled={deleting} onClick={closeDeleteDialog}>Cancel</button>
              <button className="history-confirm-delete" type="button" disabled={deleting}
                onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete Analysis"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
