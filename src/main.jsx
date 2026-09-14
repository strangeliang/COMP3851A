import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppDataProvider } from "./state/AppDataContext";
import { LanguageProvider } from "./state/LanguageContext";
import "../styles.css";
import "../user.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
