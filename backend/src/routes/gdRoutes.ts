import express from "express";
import { 
  getGDTopic, 
  generateBotResponse, 
  transcribeUserAudio, 
  endDiscussion 
} from "../controllers/gdController";

const router = express.Router();

// Get random GD topic and initialize session
router.get("/topic", getGDTopic);

// Generate bot response
router.post("/bot-response", generateBotResponse);

// Transcribe user audio input
router.post("/transcribe-user", transcribeUserAudio);

// End discussion and get feedback
router.post("/end-discussion", endDiscussion);

export default router;