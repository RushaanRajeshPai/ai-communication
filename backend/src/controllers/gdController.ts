import { Request, Response } from "express";
import User from "../models/User";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { extractAudioFeatures, calculateConfidenceCategory } from '../utils/audioAnalysis';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const WHISPER_BIN = path.resolve((process.env.WHISPER_CPP_BIN || "main").trim());
const WHISPER_MODEL = path.resolve((process.env.WHISPER_CPP_MODEL || "models/ggml-base.en.bin").trim());

// Path to Piper TTS (configure this in your .env)
const PIPER_BIN = path.resolve((process.env.PIPER_BIN || "piper").trim());
const PIPER_MODEL = path.resolve((process.env.PIPER_MODEL || "en_US-lessac-medium.onnx").trim());

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

const BOT_ROLES = [
  { 
    name: "Initiator", 
    role: "You are assertive and lead discussions. You make strong opening statements and ask thought-provoking questions.",
    voice: "en_US-lessac-medium" // Different voice configurations
  },
  { 
    name: "Analyst", 
    role: "You are logical and data-driven. You always cite facts, statistics, and research. You break down complex topics systematically.",
    voice: "en_US-lessac-medium"
  },
  { 
    name: "Contrarian", 
    role: "You challenge the status quo. You play devil's advocate and question assumptions. You're provocative but respectful.",
    voice: "en_US-lessac-medium"
  },
  { 
    name: "Mediator", 
    role: "You find balance and common ground. You summarize different viewpoints and help synthesize ideas. You're diplomatic.",
    voice: "en_US-lessac-medium"
  }
];

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

    console.log(`Created GD session: ${sessionId}`);

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

export const generateBotResponse = async (req: Request, res: Response) => {
  let audioPath: string | null = null;
  
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

    console.log(`Generating response for ${botName}`);

    // Build detailed conversation context (last 5-8 messages for better context)
    const recentHistory = session.conversationHistory.slice(-8);
    const conversationContext = recentHistory.length > 0 
      ? recentHistory.map(msg => `${msg.speaker}: ${msg.text}`).join("\n") 
      : "No previous conversation";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let prompt = "";

    if (trigger === "initiate") {
      prompt = `You are ${botName}, a participant in a group discussion on the topic: "${session.topic}"

Your role: ${bot.role}

This is the very beginning of the discussion. You are speaking first. Provide a strong, engaging opening statement that:
1. Clearly states your initial position on this topic (2-3 sentences)
2. Includes a specific example, statistic, or real-world scenario
3. Sets up for others to respond

Be conversational but substantive. Speak as if in a real discussion.

CRITICAL: Output ONLY your spoken words. No labels, no "Bot:", no meta-commentary. Just what you would say out loud.`;
    } else {
      const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
      
      prompt = `You are ${botName}, a participant in a group discussion on the topic: "${session.topic}"

Your role: ${bot.role}

Recent conversation:
${conversationContext}

${lastMessage.speaker} just said: "${lastMessage.text}"

Now it's your turn to respond. Your response should:
1. DIRECTLY address what ${lastMessage.speaker} just said
2. ${botName === "Contrarian" 
    ? "Challenge their point with a counter-argument or alternative perspective" 
    : botName === "Analyst" 
    ? "Analyze their point with logic, data, or a systematic breakdown" 
    : botName === "Mediator"
    ? "Acknowledge their point and find common ground or synthesize different views"
    : "Build on their idea or add a new dimension to the discussion"}
3. Be 2-4 sentences maximum
4. Sound natural and conversational

Stay in character. Be relevant. Advance the discussion.

CRITICAL: Output ONLY your spoken words. No labels, no meta-commentary. Just natural speech.`;
    }

    const result = await model.generateContent(prompt);
    let botResponse = result.response.text().trim();
    
    // Clean up any accidental labels
    botResponse = botResponse.replace(/^(Bot:|Initiator:|Analyst:|Contrarian:|Mediator:)\s*/i, '');

    console.log(`${botName} generated: ${botResponse}`);

    // Convert text to speech using Piper TTS
        // Convert text to speech using Piper TTS
        const tempDir = path.join(__dirname, "../../temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
    
        const timestamp = Date.now();
        audioPath = path.join(tempDir, `bot_${botName}_${timestamp}.wav`);
    
        // Sanitize text for speech (remove symbols/punctuation that get spoken aloud)
        const spokenText = botResponse
          .replace(/https?:\/\/\S+/g, '')     // remove URLs
          .replace(/[\\*\/`"_~’‘“”'"]/g, '')  // remove slashes, backslashes, quotes, markdown chars
          .replace(/[()[\]{}<>]/g, '')        // remove brackets
          .replace(/[.,!?;:]/g, '')           // remove punctuation that might be read aloud
          .replace(/\s{2,}/g, ' ')            // collapse extra spaces
          .trim();
    
        // Generate TTS audio
        // Piper command: echo "text" | piper --model model.onnx --output_file output.wav
        await new Promise<void>((resolve, reject) => {
          const piperProcess = exec(
            `echo "${spokenText.replace(/"/g, '\\"')}" | ${PIPER_BIN} --model ${PIPER_MODEL} --output_file ${audioPath}`,
            (error, stdout, stderr) => {
              if (error) {
                console.error("Piper TTS error:", error);
                console.error("stderr:", stderr);
                reject(error);
              } else {
                console.log("TTS generated successfully");
                resolve();
              }
            }
          );
        });

    // Verify audio file was created
    if (!fs.existsSync(audioPath)) {
      throw new Error("TTS audio file was not created");
    }

    // Read audio file and convert to base64
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    const message = {
      speaker: botName,
      text: botResponse,
      timestamp: Date.now(),
      isUser: false
    };

    session.conversationHistory.push(message);

    // Cleanup audio file
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    return res.status(200).json({
      botName,
      text: botResponse,
      audioData: `data:audio/wav;base64,${base64Audio}`, // Send audio to frontend
      timestamp: message.timestamp
    });

  } catch (err: any) {
    console.error("Error generating bot response:", err);
    
    // Cleanup on error
    if (audioPath && fs.existsSync(audioPath)) {
      try { fs.unlinkSync(audioPath); } catch (e) {}
    }
    
    return res.status(500).json({ 
      message: "Failed to generate bot response", 
      error: err?.message || String(err) 
    });
  }
};

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

    if (!fs.existsSync(WHISPER_BIN) || !fs.existsSync(WHISPER_MODEL)) {
      return res.status(500).json({ message: "Whisper not configured properly" });
    }

    let base64Payload = audioFile;
    let ext = "webm";
    if (audioFile.includes(",")) {
      const [meta, b64] = audioFile.split(",", 2);
      base64Payload = b64;
      if (meta.includes("audio/ogg")) ext = "ogg";
      else if (meta.includes("audio/webm")) ext = "webm";
      else if (meta.includes("audio/mp4") || meta.includes("audio/m4a")) ext = "m4a";
      else ext = "webm";
    }

    const audioBuffer = Buffer.from(base64Payload, "base64");

    if (audioBuffer.length < 4096) {
      return res.status(400).json({ message: "Audio too short" });
    }

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const stamp = Date.now();
    tempFilePath = path.join(tempDir, `gd_user_${stamp}.${ext}`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    session.userAudioFiles.push(tempFilePath);

    wavPath = path.join(tempDir, `gd_user_${stamp}.wav`);
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempFilePath!)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .format("wav")
        .on("end", () => resolve())
        .on("error", reject)
        .save(wavPath!);
    });

    const outPrefix = path.join(tempDir, `gd_transcript_${stamp}`);
    const whisperArgs = ["-m", WHISPER_MODEL, "-f", wavPath, "-otxt", "-of", outPrefix, "-nt"];

    await execFileAsync(WHISPER_BIN, whisperArgs, { 
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    transcriptTxtPath = `${outPrefix}.txt`;
    
    if (!fs.existsSync(transcriptTxtPath)) {
      throw new Error("Transcription failed");
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

    if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    if (transcriptTxtPath && fs.existsSync(transcriptTxtPath)) fs.unlinkSync(transcriptTxtPath);

    return res.status(200).json({
      transcription: transcribedText,
      timestamp: message.timestamp
    });

  } catch (err: any) {
    console.error("Error transcribing:", err);
    return res.status(500).json({ 
      message: "Failed to transcribe audio", 
      error: err?.message || String(err) 
    });
  } finally {
    try {
      if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (transcriptTxtPath && fs.existsSync(transcriptTxtPath)) fs.unlinkSync(transcriptTxtPath);
    } catch (e) {}
  }
};

export const endDiscussion = async (req: Request, res: Response) => {
  try {
    const { sessionId, userId } = req.body;

    console.log("End discussion request:", { sessionId, userId });

    if (!sessionId) {
      return res.status(400).json({ message: "Missing sessionId" });
    }

    if (!userId) {
      return res.status(400).json({ message: "Missing userId - user not logged in" });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found or expired" });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error("User not found in database:", userId);
      return res.status(404).json({ message: "User not found in database" });
    }

    console.log(`Ending GD for user: ${user.fullname}`);

    const durationSeconds = (Date.now() - session.startTime) / 1000;
    const durationMinutes = durationSeconds / 60;

    const userMessages = session.conversationHistory.filter(msg => msg.isUser);
    const fullTranscription = session.conversationHistory
      .map(msg => `${msg.speaker}: ${msg.text}`)
      .join("\n\n");
    
    const userTranscription = userMessages.map(msg => msg.text).join(" ");

    if (!userTranscription || userTranscription.trim().length === 0) {
      return res.status(400).json({ 
        message: "No user participation detected" 
      });
    }

    const words = userTranscription.trim().split(/\s+/);
    const wordCount = words.length;
    const userDurationMinutes = durationMinutes * (userMessages.length / Math.max(session.conversationHistory.length, 1));
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

    let maxRun = 1, run = 1;
    for (let i = 1; i < normalizedWords.length; i++) {
      if (normalizedWords[i] === normalizedWords[i - 1]) run++;
      else { if (run > maxRun) maxRun = run; run = 1; }
    }
    if (run > maxRun) maxRun = run;

    function cap(score: number, maxCap: number) { return Math.min(score, maxCap); }

    if (wordCount < 30) fluencyScore = cap(fluencyScore, 4);
    else if (wordCount < 60) fluencyScore = cap(fluencyScore, 5);
    else if (wordCount < 100) fluencyScore = cap(fluencyScore, 6);

    if (rateOfSpeech < 80 || rateOfSpeech > 180) fluencyScore = cap(fluencyScore, 5);
    if (maxRun >= 4) fluencyScore = cap(fluencyScore, 5);
    if (uniqueRatio < 0.70) fluencyScore = cap(fluencyScore, 5);

    fluencyScore = Math.round(Math.max(1, Math.min(10, fluencyScore)));

    let audioFeatures = {
      volume: 0.3,
      pitchVariance: 40,
      energy: 0.4,
      consistency: 0.7,
      averagePitch: 150,
      pitchRange: 60
    };

    if (session.userAudioFiles.length > 0) {
      const lastAudioFile = session.userAudioFiles[session.userAudioFiles.length - 1];
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
            .on("error", reject)
            .save(analysisWavPath);
        });

        audioFeatures = extractAudioFeatures(analysisWavPath);
        if (fs.existsSync(analysisWavPath)) fs.unlinkSync(analysisWavPath);
      } catch (e) {
        console.warn("Audio analysis failed, using defaults");
      }
    }

    const calculatedConfidence = calculateConfidenceCategory(audioFeatures, {
      rateOfSpeech,
      fillerWordCount,
      fluencyScore,
      durationMinutes: userDurationMinutes
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an expert group discussion evaluator.

Candidate: ${user.role === "student" ? "Student" : "Professional"}, Age ${user.age}

Topic: "${session.topic}"

Full Discussion:
${fullTranscription}

User's Contributions (${userMessages.length} turns):
${userTranscription}

Metrics: ${wordCount} words, ${rateOfSpeech} WPM, ${fillerWordCount} fillers, Fluency ${fluencyScore}/10
Confidence: ${calculatedConfidence}

Provide feedback in this JSON format:
{
  "confidenceCategory": "${calculatedConfidence}",
  "whatWentWell": ["specific point 1", "specific point 2", "specific point 3"],
  "areasForImprovement": ["actionable point 1", "actionable point 2", "actionable point 3"],
  "keyStrengths": ["strength 1", "strength 2"],
  "participationQuality": "brief assessment"
}

Evaluate: content quality, communication clarity, engagement level, group dynamics.
Output ONLY valid JSON.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    function extractJson(text: string) {
      const stripped = text.replace(/```json|```/g, "").trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      return (match ? match[0] : stripped).trim();
    }

    let feedbackData: any;
    try {
      const jsonStr = extractJson(responseText).replace(/[""]/g, '"').replace(/['']/g, "'");
      feedbackData = JSON.parse(jsonStr);
    } catch (e) {
      feedbackData = {
        confidenceCategory: calculatedConfidence,
        whatWentWell: ["You participated actively", "You shared your perspective", "You engaged with the topic"],
        areasForImprovement: ["Structure arguments more clearly", "Provide specific examples", "Reduce filler words"],
        keyStrengths: ["Active participation"],
        participationQuality: "Good engagement"
      };
    }

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
    user.overall.totalDuration = user.recordings.reduce((sum, rec) => sum + rec.durationMinutes, 0);
    user.overall.avgRateOfSpeech = Math.round(
      user.recordings.reduce((sum, rec) => sum + rec.feedback.rateOfSpeech, 0) / user.recordings.length
    );
    user.overall.avgFluencyScore = Math.round(
      user.recordings.reduce((sum, rec) => sum + rec.feedback.fluencyScore, 0) / user.recordings.length
    );
    user.overall.totalFillerWords = user.recordings.reduce((sum, rec) => sum + rec.fillerWordCount, 0);

    const confidenceCounts = { monotone: 0, confident: 0, hesitant: 0 } as Record<string, number>;
    user.recordings.forEach(rec => confidenceCounts[rec.feedback.confidenceCategory]++);
    const maxCategory = Object.entries(confidenceCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    user.overall.avgConfidence = maxCategory;

    await user.save();

    session.userAudioFiles.forEach(filePath => {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    });

    activeSessions.delete(sessionId);

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