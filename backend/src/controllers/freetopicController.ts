import { Request, Response } from "express";
import User from "../models/User";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs";
import * as path from "path";

const execFileAsync = promisify(execFile);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Get absolute paths and normalize them
const WHISPER_BIN = path.resolve((process.env.WHISPER_CPP_BIN || "main").trim());
const WHISPER_MODEL = path.resolve((process.env.WHISPER_CPP_MODEL || "models/ggml-base.en.bin").trim());

const FREE_TOPICS = [
  "The importance of punctuality",
  "Why reading books is still valuable",
  "How exercise keeps us happy and healthy",
  "The role of friendship in our lives",
  "Why kindness costs nothing but means a lot",
  "The habit of saying 'thank you'",
  "Why we should reduce plastic use",
  "The joy of learning new skills",
  "The importance of teamwork",
  "Why failure is a stepping stone to success",
  "Good manners in daily life",
  "The benefits of eating homemade food",
  "The value of honesty",
  "Why we should respect our parents and teachers",
  "The habit of saving money",
  "The importance of sleep",
  "Why laughter is the best medicine",
  "The need to protect animals and birds",
  "The role of discipline in student life",
  "Why technology should be used wisely"
];

export const getRandomTopic = async (req: Request, res: Response) => {
  try {
    const randomIndex = Math.floor(Math.random() * FREE_TOPICS.length);
    const topic = FREE_TOPICS[randomIndex];

    res.status(200).json({ topic });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const processRecording = async (req: Request, res: Response) => {
  let tempFilePath: string | null = null;
  let wavPath: string | null = null;
  let transcriptTxtPath: string | null = null;

  try {
    const { userId, audioFile, durationSeconds } = req.body;

    console.log("=== Processing Recording Request ===");
    console.log("User ID:", userId);
    console.log("Audio file length:", audioFile?.length || 0);
    console.log("Duration:", durationSeconds);

    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }
    if (!audioFile || typeof audioFile !== "string") {
      return res.status(400).json({ message: "No audio file provided" });
    }
    if (!durationSeconds || Number.isNaN(Number(durationSeconds)) || durationSeconds <= 0) {
      return res.status(400).json({ message: "Invalid recording duration" });
    }

    // Validate whisper paths early
    console.log("Whisper binary path:", WHISPER_BIN);
    console.log("Whisper model path:", WHISPER_MODEL);
    
    if (!fs.existsSync(WHISPER_BIN)) {
      console.error("Whisper binary not found!");
      return res.status(500).json({ message: `Whisper binary not found at: ${WHISPER_BIN}` });
    }
    if (!fs.existsSync(WHISPER_MODEL)) {
      console.error("Whisper model not found!");
      return res.status(500).json({ message: `Whisper model not found at: ${WHISPER_MODEL}` });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let base64Payload = audioFile;
    let ext = "webm";
    if (audioFile.includes(",")) {
      const [meta, b64] = audioFile.split(",", 2);
      base64Payload = b64;
      if (meta.includes("audio/ogg")) ext = "ogg";
      else if (meta.includes("audio/webm")) ext = "webm";
      else if (meta.includes("audio/mp4") || meta.includes("audio/m4a") || meta.includes("audio/aac")) ext = "m4a";
      else if (meta.includes("audio/mpeg") || meta.includes("audio/mp3")) ext = "mp3";
      else ext = "webm";
    }

    const audioBuffer = Buffer.from(base64Payload, "base64");

    console.log("Audio buffer size:", audioBuffer.length);

    if (!audioBuffer || audioBuffer.length < 8192) {
      return res.status(400).json({ message: "Audio seems empty or too short. Please re-record and submit again." });
    }

    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const stamp = Date.now();
    tempFilePath = path.join(tempDir, `audio_${stamp}.${ext}`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log("Saved temp audio file:", tempFilePath);

    wavPath = path.join(tempDir, `audio_${stamp}.wav`);
    console.log("Converting to WAV:", wavPath);
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempFilePath!)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .format("wav")
        .on("start", (cmd) => {
          console.log("FFmpeg command:", cmd);
        })
        .on("end", () => {
          console.log("FFmpeg conversion complete");
          resolve();
        })
        .on("error", (err: any) => {
          console.error("FFmpeg error:", err);
          reject(err);
        })
        .save(wavPath!);
    });

    const outPrefix = path.join(tempDir, `transcript_${stamp}`);

    // Verify WAV file
    const wavStats = fs.statSync(wavPath);
    console.log("WAV file size:", wavStats.size);
    
    if (!wavStats || wavStats.size < 8000) {
      throw new Error(`WAV seems empty or too small: ${wavPath} (${wavStats?.size || 0} bytes)`);
    }

    // Use absolute paths directly (no normalization needed for Windows)
    const whisperArgs = [
      "-m", WHISPER_MODEL,
      "-f", wavPath,
      "-otxt",
      "-of", outPrefix,
      "-nt"
    ];

    console.log("=== Running Whisper ===");
    console.log("Binary:", WHISPER_BIN);
    console.log("Args:", whisperArgs.join(" "));

    try {
      const { stdout, stderr } = await execFileAsync(
        WHISPER_BIN,
        whisperArgs,
        { 
          windowsHide: true,
          timeout: 120000, // 2 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );
      
      if (stdout) console.log("Whisper stdout:", stdout);
      if (stderr) console.log("Whisper stderr:", stderr);
      
    } catch (e: any) {
      console.error("=== Whisper Execution Failed ===");
      console.error("Error code:", e?.code);
      console.error("Signal:", e?.signal);
      console.error("Stdout:", e?.stdout);
      console.error("Stderr:", e?.stderr);
      console.error("Message:", e?.message);
      
      const details = [
        e?.stderr,
        e?.stdout,
        e?.message
      ].filter(Boolean).join("\n");
      
      throw new Error(`Whisper.cpp transcription failed: ${details || "unknown error"}`);
    }

    transcriptTxtPath = `${outPrefix}.txt`;
    console.log("Looking for transcript at:", transcriptTxtPath);
    
    if (!fs.existsSync(transcriptTxtPath)) {
      // List files in temp dir to debug
      const tempFiles = fs.readdirSync(tempDir);
      console.error("Transcript not found. Files in temp dir:", tempFiles);
      throw new Error("Transcription file was not created");
    }
    
    const transcribedText = fs.readFileSync(transcriptTxtPath, "utf-8").trim();
    console.log("Transcription:", transcribedText);
    
    if (!transcribedText) {
      throw new Error("Transcription is empty");
    }

    // Metrics calculation
    const words = transcribedText.trim().split(/\s+/);
    const wordCount = words.length;
    const durationMinutes = Number(durationSeconds) / 60;
    const rateOfSpeech = Math.max(1, Math.round(wordCount / Math.max(durationMinutes, 0.1)));

    const fillerWords = ["uh", "um", "like", "you know", "hmm", "ah", "er", "so"];
    const fillerWordCount = words.filter((word: string) =>
      fillerWords.includes(word.toLowerCase().replace(/[.,!?]/g, ""))
    ).length;

    const fillerRatio = fillerWordCount / Math.max(wordCount, 1);
    const fluencyScore = Math.max(1, Math.min(10, Math.round(10 - (fillerRatio * 50))));

    console.log("Generating AI feedback...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `
You are an expert communication coach. Analyze the following speech transcription and provide detailed feedback.

Speaker Profile:
- Role: ${user.role === "student" ? "Student" : "Working Professional"}
- Age: ${user.age}

Speech Transcription:
"${transcribedText}"

Metrics:
- Word Count: ${wordCount}
- Rate of Speech: ${rateOfSpeech} words per minute
- Filler Words: ${fillerWordCount}
- Duration: ${durationMinutes.toFixed(2)} minutes

Please provide feedback in the following JSON format:
{
  "confidenceCategory": "monotone" | "confident" | "hesitant",
  "whatWentWell": ["point1", "point2", "point3"],
  "areasForImprovement": ["point1", "point2", "point3"],
  "sentenceImprovements": [
    {
      "original": "unpolished sentence from the speech",
      "improved": "enhanced version of the sentence"
    }
  ]
}

Evaluate confidence based on:
- Tone consistency and energy (consider that ${user.role === "work" ? "working professionals typically have more developed speaking skills" : "students are still developing their communication skills"})
- Use of filler words
- Sentence structure and flow
- Word choice and vocabulary

Provide 3 points for what went well, 3 areas for improvement, and 3-4 sentence improvements.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const feedbackData = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      confidenceCategory: "hesitant",
      whatWentWell: ["You completed the speech", "You stayed on topic"],
      areasForImprovement: ["Reduce filler words", "Speak more confidently"],
      sentenceImprovements: []
    };

    // Create recording
    const recording = {
      scenario: "Free Topic",
      transcription: transcribedText,
      durationMinutes: parseFloat(durationMinutes.toFixed(2)),
      fillerWordCount,
      feedback: {
        confidenceCategory: feedbackData.confidenceCategory,
        rateOfSpeech,
        fluencyScore
      }
    };

    // Persist
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
    user.recordings.forEach(rec => {
      confidenceCounts[rec.feedback.confidenceCategory]++;
    });
    const maxCategory = Object.entries(confidenceCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    user.overall.avgConfidence = maxCategory;

    await user.save();

    console.log("=== Processing Complete ===");

    return res.status(200).json({
      message: "Recording processed successfully",
      transcription: transcribedText,
      metrics: {
        rateOfSpeech,
        fluencyScore,
        confidenceCategory: feedbackData.confidenceCategory,
        fillerWordCount,
        durationMinutes: parseFloat(durationMinutes.toFixed(2))
      },
      feedback: feedbackData
    });

  } catch (err: any) {
    console.error("=== Error Processing Recording ===");
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err?.message || String(err) });
  } finally {
    // Cleanup
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log("Cleaned up:", tempFilePath);
      }
      if (wavPath && fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
        console.log("Cleaned up:", wavPath);
      }
      if (transcriptTxtPath && fs.existsSync(transcriptTxtPath)) {
        fs.unlinkSync(transcriptTxtPath);
        console.log("Cleaned up:", transcriptTxtPath);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }
};