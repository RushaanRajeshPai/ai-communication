import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import userRoutes from "./routes/userRoutes";
import freetopicRoutes from "./routes/storyRoutes";
import interviewRoutes from "./routes/interviewRoutes";
import gdRoutes from "./routes/gdRoutes";

const app = express();
app.use(cors());

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

connectDB();

app.use("/api/users", userRoutes);
app.use("/api/freetopic", freetopicRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/gd", gdRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));