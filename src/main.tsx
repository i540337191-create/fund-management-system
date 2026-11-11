import {initializeRequiredWordHighlight} from './lib/requiredWordHighlight';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./atelier.css";
import "./agentWorkbench.css";
import "./controls.css";
import "./businessVisuals.css";
import "./components/MeetingWorkspace.css";
import "./iterationB/projectArchiveRefined.css";
import { initializeSelectPicker } from "./lib/selectPicker";
import { initializeTitleTooltips } from "./lib/titleTooltips";
import { initializeColorMode } from "./lib/colorMode";

document.documentElement.classList.add("atelier-theme");
initializeColorMode();
initializeTitleTooltips();
initializeSelectPicker();
initializeRequiredWordHighlight();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
import './responsiveWorkspaces.css';
import './employee-console.css';
