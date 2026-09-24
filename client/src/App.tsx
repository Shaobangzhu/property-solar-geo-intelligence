import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AnalyzePage } from "./pages/AnalyzePage";
import { HistoryPage } from "./pages/HistoryPage";

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <a className="brand" href="/analyze">Property Solar Geo Intelligence</a>
          <span className="badge">PoC</span>
        </div>
        <nav aria-label="Primary navigation">
          <NavLink to="/analyze">Analyze</NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/analyze" replace />} />
        </Routes>
      </main>
    </div>
  );
}
