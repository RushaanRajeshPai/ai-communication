import { Request, Response } from "express";
import User from "../models/User";

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params; // Get userId from URL params

    if (!userId) {
      return res.status(401).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prepare recording trends data
    const recordingTrends = user.recordings.map((recording, index) => ({
      recordingNumber: index + 1,
      scenario: recording.scenario,
      confidenceCategory: recording.feedback.confidenceCategory,
      rateOfSpeech: recording.feedback.rateOfSpeech,
      fluencyScore: recording.feedback.fluencyScore,
      fillerWordCount: recording.fillerWordCount,
      createdAt: recording.createdAt
    }));

    const dashboardData = {
      fullname: user.fullname,
      email: user.email,
      gender: user.gender,
      age: user.age,
      role: user.role,
      overall: user.overall,
      totalRecordings: user.recordings.length,
      recordingTrends
    };

    return res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Dashboard data fetch error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getDetailedStats = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId).select("recordings overall");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Calculate scenario-wise statistics
    const scenarioStats: { [key: string]: any } = {};

    user.recordings.forEach((recording) => {
      if (!scenarioStats[recording.scenario]) {
        scenarioStats[recording.scenario] = {
          count: 0,
          totalDuration: 0,
          totalFillerWords: 0,
          totalRateOfSpeech: 0,
          totalFluency: 0
        };
      }

      const stats = scenarioStats[recording.scenario];
      stats.count++;
      stats.totalDuration += recording.durationMinutes;
      stats.totalFillerWords += recording.fillerWordCount;
      stats.totalRateOfSpeech += recording.feedback.rateOfSpeech;
      stats.totalFluency += recording.feedback.fluencyScore;
    });

    // Calculate averages
    Object.keys(scenarioStats).forEach((scenario) => {
      const stats = scenarioStats[scenario];
      stats.avgRateOfSpeech = stats.totalRateOfSpeech / stats.count;
      stats.avgFluency = stats.totalFluency / stats.count;
      stats.avgFillerWords = stats.totalFillerWords / stats.count;
    });

    return res.status(200).json({
      overall: user.overall,
      scenarioStats
    });
  } catch (error) {
    console.error("Detailed stats fetch error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};