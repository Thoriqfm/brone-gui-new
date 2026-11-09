import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { prepareFaceRenderer } from "./animation/prepareFaceRenderer";
import "./style.css";
const root = document.getElementById("root")!;
void prepareFaceRenderer().then(() => createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)).catch((error: unknown) => {
    console.error("Face preparation failed", error);
    root.textContent = "Persiapan wajah gagal. Muat ulang halaman.";
});
