import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import issueRoutes from "./routes/issueRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { admin } from "./config/admin.js";
import staffRoutes from "./routes/staffRoutes.js";
dotenv.config();
const app = express();


app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://final-project-d2289.web.app",
      "https://final-project-d2289.firebaseapp.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight OPTIONS requests explicitly
app.options("*", cors());
app.use(express.json())

// database connect
connectDB();
admin();

app.get("/", (req, res) => {
  res.send(" Server Running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on ${port}`));