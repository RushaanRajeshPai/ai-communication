import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);

mongoose.connect(process.env.MONGO_URI || "")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

app.listen(5000, () => console.log("Server running on port 5000"));
