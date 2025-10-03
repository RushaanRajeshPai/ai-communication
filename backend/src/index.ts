import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import connectDB from "./config/db";
import userRoutes from "./routes/userRoutes";
import freetopicRoutes from "./routes/storyRoutes";
import interviewRoutes from "./routes/interviewRoutes";
import gdRoutes from "./routes/gdRoutes";
import freeRoutes from "./routes/freeRoutes";
import { handleFreeConversationMessage, handleSilenceTimeout } from "./controllers/freeController";

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"], // Add both ports
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

connectDB();

// Routes
app.use("/api/users", userRoutes);
app.use("/api/freetopic", freetopicRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/gd", gdRoutes);
app.use("/api/free", freeRoutes); // Add this line

// WebSocket event handlers
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-conversation", (conversationId: string) => {
    socket.join(conversationId);
    console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on("user-message", async (data: { conversationId: string; message: string }) => {
    console.log("Received user message:", data.message);
    await handleFreeConversationMessage(data.conversationId, data.message, io);
  });

  socket.on("silence-timeout", async (conversationId: string) => {
    console.log("Silence timeout for conversation:", conversationId);
    await handleSilenceTimeout(conversationId, io);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));