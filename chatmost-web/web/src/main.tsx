/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import App from "./App";
import "./index.css";
import { ApiProvider } from "./lib/api";
import { convexClient } from "./lib/convex";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convexClient}>
      <ApiProvider>
        <App />
      </ApiProvider>
    </ConvexProvider>
  </React.StrictMode>
);