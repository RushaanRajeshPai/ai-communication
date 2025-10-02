import express from "express";
import { getRandomTopic, processRecording } from "../controllers/storyController";

const router = express.Router();

router.get("/topic", getRandomTopic);
router.post("/process", processRecording);

export default router;