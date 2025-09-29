import express from "express";
import {
  signup,
  login,
  logout,
  addRecording
} from "../controllers/userController";

const router = express.Router();

// Auth routes
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

// Recording route
router.post("/recording", addRecording);

export default router;
