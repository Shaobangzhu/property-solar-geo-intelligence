import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import esriConfig from "@arcgis/core/config";
import { App } from "./App";
import "./styles.css";

esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY?.trim() || null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
