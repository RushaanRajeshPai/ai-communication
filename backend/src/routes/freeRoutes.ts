import express from "express";
import { 
  initializeFreeConversation, 
  getFreeConversationFeedback 
} from "../controllers/freeController";

const router = express.Router();

router.post("/initialize", initializeFreeConversation);
router.get("/feedback/:conversationId", getFreeConversationFeedback);

export default router;