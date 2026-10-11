import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./public/App";
import "./public/styles.css";
import "./public/refresh.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
