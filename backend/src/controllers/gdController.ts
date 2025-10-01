import { Request, Response } from "express";
import User from "../models/User";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { extractAudioFeatures, calculateConfidenceCategory } from '../utils/audioAnalysis';

const execFileAsync = promisify(execFile);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const WHISPER_BIN = path.resolve((process.env.WHISPER_CPP_BIN || "main").trim());
const WHISPER_MODEL = path.resolve((process.env.WHISPER_CPP_MODEL || "models/ggml-base.en.bin").trim());

// Hardcoded GD topics
const GD_TOPICS = [
  "Should artificial intelligence replace human decision-making in critical sectors like healthcare and finance?",
  "Is remote work more productive than traditional office work?",
  "Should social media platforms be held responsible for the content posted by users?",
  "Is climate change primarily the responsibility of individuals or corporations?",
  "Should higher education be free for all citizens?",
  "Does technology make us more connected or more isolated?",
  "Should governments regulate cryptocurrency?",
  "Is work-life balance achievable in today's corporate culture?",
  "Should companies prioritize profit or social responsibility?",
  "Is online learning as effective as traditional classroom education?"
];

// Bot roles and their characteristics
const BOT_ROLES = [
  { name: "Initiator", role: "You initiate discussions with strong opening statements and set the tone" },
  { name: "Analyst", role: "You provide data-driven insights and logical analysis" },
  { name: "Contrarian", role: "You challenge prevailing opinions and offer alternative perspectives" },
  { name: "Mediator", role: "You find common ground and summarize key points" }
];

// In-memory session storage (in production, use Redis or similar)
interface GDSession {
  sessionId: string;
  topic: string;
  bots: typeof BOT_ROLES;
  conversationHistory: Array<{
    speaker: string;
    text: string;
    timestamp: number;
    isUser: boolean;
  }>;
  userAudioFiles: string[];
  startTime: number;
}

const activeSessions = new Map<string, GDSession>();

// Generate random topic and initialize session
export const getGDTopic = async (req: Request, res: Response) => {
  try {
    const sessionId = `gd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const randomTopic = GD_TOPICS[Math.floor(Math.random() * GD_TOPICS.length)];

    const session: GDSession = {
      sessionId,
      topic: randomTopic,
      bots: BOT_ROLES,
      conversationHistory: [],
      userAudioFiles: [],
      startTime: Date.now()
    };

    activeSessions.set(sessionId, session);

    console.log(`Created new GD session: ${sessionId} with topic: ${randomTopic}`);

    return res.status(200).json({
      sessionId,
      topic: randomTopic,
      bots: BOT_ROLES.map(b => ({ name: b.name, speaking: false }))
    });

  } catch (err: any) {
    console.error("Error generating GD topic:", err);
    return res.status(500).json({ 
      message: "Failed to start discussion", 
      error: err?.message || String(err) 
    });
  }
};

// Generate bot response using Gemini
export const generateBotResponse = async (req: Request, res: Response) => {
  try {
    const { sessionId, botName, trigger } = req.body;

    if (!sessionId || !botName) {
      return res.status(400).json({ message: "Missing sessionId or botName" });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const bot = session.bots.find(b => b.name === botName);
    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }

    console.log(`Generating response for ${botName} (trigger: ${trigger})`);

    // Build conversation context
    const conversationContext = session.conversationHistory
      .map(msg => `${msg.speaker}: ${msg.text}`)
      .join("\n");

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    let prompt = "";

    if (trigger === "initiate") {
      prompt = `
You are ${botName} in a group discussion. ${bot.role}.

Topic: "${session.topic}"

This is the start of the discussion. Provide a strong, engaging opening statement (2-3 sentences) that introduces your perspective on this topic. Be confident and set the tone for a productive discussion.

IMPORTANT: Respond with ONLY your statement. No labels, no speaker names, just the content.
`;
    } else {
      prompt = `
You are ${botName} in a group discussion. ${bot.role}.

Topic: "${session.topic}"

Previous conversation:
${conversationContext}

Based on the above discussion, provide your response (2-3 sentences). Stay in character, be relevant to what was just said, and advance the discussion meaningfully. ${
  botName === "Contrarian" 
    ? "Challenge the previous point respectfully." 
    : botName === "Analyst" 
    ? "Provide logical analysis or data-driven insights." 
    : botName === "Mediator"
    ? "Find common ground or summarize key points."
    : "Build on the previous points constructively."
}

IMPORTANT: Respond with ONLY your statement. No labels, no speaker names, just the content.
`;
    }

    const result = await model.generateContent(prompt);
    const botResponse = result.response.text().trim();

    const message = {
      speaker: botName,
      text: botResponse,
      timestamp: Date.now(),
      isUser: false
    };

    session.conversationHistory.push(message);

    console.log(`${botName}: ${botResponse}`);

    return res.status(200).json({
      botName,
      text: botResponse,
      timestamp: message.timestamp
    });

  } catch (err: any) {
    console.error("Error generating bot response:", err);
    return res.status(500).json({ 
      message: "Failed to generate bot response", 
      error: err?.message || String(err) 
    });
  }
};

// Transcribe user audio
export const transcribeUserAudio = async (req: Request, res: Response) => {
  let tempFilePath: string | null = null;
  let wavPath: string | null = null;
  let transcriptTxtPath: string | null = null;

  try {
    const { sessionId, audioFile } = req.body;

    if (!sessionId || !audioFile) {
      return res.status(400).json({ message: "Missing sessionId or audioFile" });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    console.log(`Transcribing user audio for session: ${sessionId}`);

    // Validate whisper paths
    if (!fs.existsSync(WHISPER_BIN)) {
      return res.status(500).json({ message: `Whisper binary not found at: ${WHISPER_BIN}` });
    }
    if (!fs.existsSync(WHISPER_MODEL)) {
      return res.status(500).json({ message: `Whisper model not found at: ${WHISPER_MODEL}` });
    }

    // Parse base64 audio
    let base64Payload = audioFile;
    let ext = "webm";
    if (audioFile.includes(",")) {
      const [meta, b64] = audioFile.split(",", 2);
      base64Payload = b64;
      if (meta.includes("audio/ogg")) ext = "ogg";
      else if (meta.includes("audio/webm")) ext = "webm";
      else if (meta.includes("audio/mp4") || meta.includes("audio/m4a")) ext = "m4a";
      else if (meta.includes("audio/mpeg") || meta.includes("audio/mp3")) ext = "mp3";
      else ext = "webm";
    }

    const audioBuffer = Buffer.from(base64Payload, "base64");

    if (!audioBuffer || audioBuffer.length < 4096) {
      return res.status(400).json({ 
        message: "Audio seems empty or too short" 
      });
    }

    // Create temp directory
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const stamp = Date.now();
    tempFilePath = path.join(tempDir, `gd_user_${stamp}.${ext}`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Store the temp file path for later use in final analysis
    session.userAudioFiles.push(tempFilePath);

    // Convert to WAV
    wavPath = path.join(tempDir, `gd_user_${stamp}.wav`);
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempFilePath!)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .format("wav")
        .on("end", () => resolve())
        .on("error", (err: any) => reject(err))
        .save(wavPath!);
    });

    const outPrefix = path.join(tempDir, `gd_transcript_${stamp}`);

    // Run Whisper
    const whisperArgs = [
      "-m", WHISPER_MODEL,
      "-f", wavPath,
      "-otxt",
      "-of", outPrefix,
      "-nt"
    ];

    await execFileAsync(WHISPER_BIN, whisperArgs, { 
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    transcriptTxtPath = `${outPrefix}.txt`;
    
    if (!fs.existsSync(transcriptTxtPath)) {
      throw new Error("Transcription file was not created");
    }
    
    const transcribedText = fs.readFileSync(transcriptTxtPath, "utf-8").trim();
    
    if (!transcribedText) {
      throw new Error("Transcription is empty");
    }

    const message = {
      speaker: "You",
      text: transcribedText,
      timestamp: Date.now(),
      isUser: true
    };

    session.conversationHistory.push(message);

    console.log(`User: ${transcribedText}`);

    // Cleanup immediately after transcription
    if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    if (transcriptTxtPath && fs.existsSync(transcriptTxtPath)) fs.unlinkSync(transcriptTxtPath);

    return res.status(200).json({
      transcription: transcribedText,
      timestamp: message.timestamp
    });

  } catch (err: any) {
    console.error("Error transcribing user audio:", err);
    return res.status(500).json({ 
      message: "Failed to transcribe audio", 
      error: err?.message || String(err) 
    });
  } finally {
    // Cleanup
    try {
      if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (transcriptTxtPath && fs.existsSync(transcriptTxtPath)) fs.unlinkSync(transcriptTxtPath);
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }
};

// End discussion and generate feedback
export const endDiscussion = async (req: Request, res: Response) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ message: "Missing sessionId or userId" });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`Ending GD session: ${sessionId}`);

    // Calculate duration
    const durationSeconds = (Date.now() - session.startTime) / 1000;
    const durationMinutes = durationSeconds / 60;

    // Get user's contributions only
    const userMessages = session.conversationHistory.filter(msg => msg.isUser);
    const fullTranscription = session.conversationHistory
      .map(msg => `${msg.speaker}: ${msg.text}`)
      .join("\n\n");
    
    const userTranscription = userMessages.map(msg => msg.text).join(" ");

    if (!userTranscription || userTranscription.trim().length === 0) {
      return res.status(400).json({ 
        message: "No user participation detected in the discussion" 
      });
    }

    // Calculate metrics based on user's speech only
    const words = userTranscription.trim().split(/\s+/);
    const wordCount = words.length;
    const userDurationMinutes = durationMinutes * (userMessages.length / session.conversationHistory.length);
    const rateOfSpeech = Math.max(1, Math.round(wordCount / Math.max(userDurationMinutes, 0.1)));

    const fillerWords = ["uh", "um", "like", "you know", "hmm", "ah", "er", "so", "basically"];
    const fillerWordCount = words.filter((word: string) =>
      fillerWords.includes(word.toLowerCase().replace(/[.,!?]/g, ""))
    ).length;

    const fillerRatio = fillerWordCount / Math.max(wordCount, 1);
    let fluencyScore = 10 - fillerRatio * 60;

    const normalizedWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
    const uniqueWords = new Set(normalizedWords);
    const uniqueRatio = uniqueWords.size / Math.max(normalizedWords.length, 1);

    // Repetition analysis
    let maxRun = 1, run = 1;
    for (let i = 1; i < normalizedWords.length; i++) {
      if (normalizedWords[i] === normalizedWords[i - 1]) run++;
      else { if (run > maxRun) maxRun = run; run = 1; }
    }
    if (run > maxRun) maxRun = run;

    // Apply caps
    function cap(score: number, maxCap: number) { return Math.min(score, maxCap); }

    if (wordCount < 30) fluencyScore = cap(fluencyScore, 4);
    else if (wordCount < 60) fluencyScore = cap(fluencyScore, 5);
    else if (wordCount < 100) fluencyScore = cap(fluencyScore, 6);

    if (rateOfSpeech < 80 || rateOfSpeech > 180) fluencyScore = cap(fluencyScore, 5);
    if (maxRun >= 4) fluencyScore = cap(fluencyScore, 5);
    if (uniqueRatio < 0.70) fluencyScore = cap(fluencyScore, 5);

    fluencyScore = Math.round(Math.max(1, Math.min(10, fluencyScore)));

    // Extract audio features from all user audio files
    let audioFeatures = {
      volume: 0.3,
      pitchVariance: 40,
      energy: 0.4,
      consistency: 0.7,
      averagePitch: 150,
      pitchRange: 60
    };

    // Try to analyze the most recent user audio file
    if (session.userAudioFiles.length > 0) {
      const lastAudioFile = session.userAudioFiles[session.userAudioFiles.length - 1];
      
      // Convert to WAV for analysis
      const tempDir = path.join(__dirname, "../../temp");
      const analysisWavPath = path.join(tempDir, `gd_analysis_${Date.now()}.wav`);
      
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(lastAudioFile)
            .noVideo()
            .audioChannels(1)
            .audioFrequency(16000)
            .format("wav")
            .on("end", () => resolve())
            .on("error", (err: any) => reject(err))
            .save(analysisWavPath);
        });

        audioFeatures = extractAudioFeatures(analysisWavPath);
        
        if (fs.existsSync(analysisWavPath)) fs.unlinkSync(analysisWavPath);
      } catch (e) {
        console.warn("Could not extract audio features, using defaults:", e);
      }
    }

    const calculatedConfidence = calculateConfidenceCategory(audioFeatures, {
      rateOfSpeech,
      fillerWordCount,
      fluencyScore,
      durationMinutes: userDurationMinutes
    });

    // Generate feedback using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `
You are an expert group discussion evaluator. Analyze this candidate's performance in a group discussion.

Candidate Profile:
- Role: ${user.role === "student" ? "Student" : "Working Professional"}
- Age: ${user.age}

Discussion Topic: "${session.topic}"

Full Discussion Transcript (includes AI bots and user):
${fullTranscription}

User's Contributions Only:
${userTranscription}

Performance Metrics:
- Total Words Spoken: ${wordCount}
- Rate of Speech: ${rateOfSpeech} WPM
- Filler Words: ${fillerWordCount}
- Fluency Score: ${fluencyScore}/10
- Participation: ${userMessages.length} turns out of ${session.conversationHistory.length} total

Audio Analysis:
- Volume: ${audioFeatures.volume.toFixed(3)}
- Pitch Variation: ${audioFeatures.pitchVariance.toFixed(1)} Hz
- Energy: ${audioFeatures.energy.toFixed(3)}
- Calculated Confidence: ${calculatedConfidence}

Provide feedback in this EXACT JSON format:
{
  "confidenceCategory": "${calculatedConfidence}",
  "whatWentWell": ["point1", "point2", "point3"],
  "areasForImprovement": ["point1", "point2", "point3"],
  "keyStrengths": ["strength1", "strength2"],
  "participationQuality": "brief assessment"
}

Evaluation Criteria:
1. Content Quality: Relevance, logical arguments, examples
2. Communication: Clarity, confidence, articulation
3. Engagement: Active listening, building on others' points
4. Group Dynamics: Respectful disagreement, turn-taking

Output ONLY valid JSON. No markdown, no code fences.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse feedback
    function extractJson(text: string) {
      const stripped = text.replace(/```json|```/g, "").trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      return (match ? match[0] : stripped).trim();
    }

    let feedbackData: any;
    try {
      const jsonStr = extractJson(responseText)
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'");
      feedbackData = JSON.parse(jsonStr);
    } catch (e) {
      console.warn("Failed to parse feedback JSON:", e);
      feedbackData = {
        confidenceCategory: calculatedConfidence,
        whatWentWell: [
          "You participated in the group discussion",
          "You contributed your thoughts on the topic",
          "You engaged with the conversation"
        ],
        areasForImprovement: [
          "Structure your points more clearly",
          "Provide more specific examples",
          "Reduce filler words for better fluency"
        ],
        keyStrengths: ["Active participation"],
        participationQuality: "Good engagement with room for improvement"
      };
    }

    // Save to database
    const recording = {
      scenario: `Group Discussion: ${session.topic}`,
      transcription: userTranscription,
      durationMinutes: parseFloat(userDurationMinutes.toFixed(2)),
      fillerWordCount,
      feedback: {
        confidenceCategory: feedbackData.confidenceCategory,
        rateOfSpeech,
        fluencyScore
      }
    };

    user.recordings.push(recording);

    // Update overall stats
    user.overall.totalDuration = user.recordings.reduce((sum, rec) => sum + rec.durationMinutes, 0);
    user.overall.avgRateOfSpeech = Math.round(
      user.recordings.reduce((sum, rec) => sum + rec.feedback.rateOfSpeech, 0) / user.recordings.length
    );
    user.overall.avgFluencyScore = Math.round(
      user.recordings.reduce((sum, rec) => sum + rec.feedback.fluencyScore, 0) / user.recordings.length
    );
    user.overall.totalFillerWords = user.recordings.reduce((sum, rec) => sum + rec.fillerWordCount, 0);

    const confidenceCounts = { monotone: 0, confident: 0, hesitant: 0 } as Record<string, number>;
    user.recordings.forEach(rec => {
      confidenceCounts[rec.feedback.confidenceCategory]++;
    });
    const maxCategory = Object.entries(confidenceCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    user.overall.avgConfidence = maxCategory;

    await user.save();

    // Cleanup session and temp files
    session.userAudioFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.error("Error deleting temp file:", e);
      }
    });

    activeSessions.delete(sessionId);

    console.log("GD session complete, feedback generated");

    return res.status(200).json({
      message: "Discussion ended successfully",
      metrics: {
        rateOfSpeech,
        fluencyScore,
        confidenceCategory: feedbackData.confidenceCategory,
        fillerWordCount,
        durationMinutes: parseFloat(userDurationMinutes.toFixed(2))
      },
      feedback: feedbackData
    });

  } catch (err: any) {
    console.error("Error ending discussion:", err);
    return res.status(500).json({ 
      message: "Failed to end discussion", 
      error: err?.message || String(err) 
    });
  }
};