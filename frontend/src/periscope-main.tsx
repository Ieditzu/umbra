import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PeriscopeLab } from "./PeriscopeLab";
import "./styles.css";
import "./periscope.css";

createRoot(document.getElementById("root")!).render(<StrictMode><PeriscopeLab /></StrictMode>);
