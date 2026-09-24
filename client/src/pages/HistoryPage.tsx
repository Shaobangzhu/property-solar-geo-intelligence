export function HistoryPage() {
  return (
    <section aria-labelledby="history-title" className="page">
      <div className="page-heading">
        <p className="eyebrow">SAVED SCENARIOS</p>
        <h1 id="history-title">Analysis History</h1>
      </div>
      <section className="empty-state">
        <h2>No saved analyses yet</h2>
        <p>Saved analysis runs will appear here after you analyze a property.</p>
      </section>
    </section>
  );
}
