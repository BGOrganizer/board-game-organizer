import { createRoot } from "react-dom/client";
import { z } from "zod";
import { Widget } from "./Widget";
import "./widget.css";

z.config({ jitless: true });
const element = document.getElementById("root");
if (element) createRoot(element).render(<Widget />);
