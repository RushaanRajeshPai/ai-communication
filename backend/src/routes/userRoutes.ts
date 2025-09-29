import express from "express";
import {
  signup,
  login,
  logout,
  addRecording,
  getUserById  
} from "../controllers/userController";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/user/:userId", getUserById);
router.post("/recording", addRecording);

export default router;
