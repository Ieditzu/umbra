import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ParkingCamera } from "./ParkingCamera";
import "./styles.css";
import "./parking.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ParkingCamera /></StrictMode>);
