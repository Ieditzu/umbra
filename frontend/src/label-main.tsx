import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClipLabeler } from "./ClipLabeler";
import "./styles.css";
import "./parking.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ClipLabeler /></StrictMode>);
