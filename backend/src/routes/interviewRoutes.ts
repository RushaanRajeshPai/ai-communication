import express from "express";
import { processInterview } from "../controllers/interviewController";

const router = express.Router();

// POST /api/interview/process - Process complete interview recording
router.post("/process", processInterview);

export default router;