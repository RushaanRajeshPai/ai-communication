import express from "express";
import { getDashboardData, getDetailedStats } from "../controllers/dashboardController";

const router = express.Router();

// Get main dashboard data - userId passed as URL parameter
router.get("/:userId", getDashboardData);

// Get detailed statistics - userId passed as URL parameter
router.get("/stats/:userId", getDetailedStats);

export default router;