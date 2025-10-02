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

// Get absolute paths and normalize them
const WHISPER_BIN = path.resolve((process.env.WHISPER_CPP_BIN || "main").trim());
const WHISPER_MODEL = path.resolve((process.env.WHISPER_CPP_MODEL || "models/ggml-base.en.bin").trim());

export const processInterview = async (req: Request, res: Response) => {
  let tempFilePath: string | null = null;
  let wavPath: string | null = null;
  let transcriptTxtPath: string | null = null;

  try {
    const { userId, audioFile, durationSeconds, questions } = req.body;

    console.log("=== Processing Interview Request ===");
    console.log("User ID:", userId);
    console.log("Audio file length:", audioFile?.length || 0);
    console.log("Duration:", durationSeconds);
    console.log("Questions count:", questions?.length || 0);

    // Validation
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }
    if (!audioFile || typeof audioFile !== "string") {
      return res.status(400).json({ message: "No audio file provided" });
    }
    if (!durationSeconds || Number.isNaN(Number(durationSeconds)) || durationSeconds <= 0) {
      return res.status(400).json({ message: "Invalid recording duration" });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "Missing interview questions" });
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

    // Parse base64 audio
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
      return res.status(400).json({
        message: "Audio seems empty or too short. Please ensure you answered all questions properly."
      });
    }

    // Create temp directory
    const tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const stamp = Date.now();
    tempFilePath = path.join(tempDir, `interview_${stamp}.${ext}`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log("Saved temp audio file:", tempFilePath);

    // Convert to WAV for Whisper
    wavPath = path.join(tempDir, `interview_${stamp}.wav`);
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

    const outPrefix = path.join(tempDir, `interview_transcript_${stamp}`);

    // Verify WAV file
    // Verify WAV file
    const wavStats = fs.statSync(wavPath!);
    console.log("WAV file size:", wavStats.size);

    if (!wavStats || wavStats.size < 8000) {
      throw new Error(`WAV seems empty or too small: ${wavPath} (${wavStats?.size || 0} bytes)`);
    }

    // Run Whisper transcription
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
          timeout: 180000, // 3 minute timeout
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

    if (!fs.existsSync(transcriptTxtPath!)) {
      const tempFiles = fs.readdirSync(tempDir);
      console.error("Transcript not found. Files in temp dir:", tempFiles);
      throw new Error("Transcription file was not created");
    }

    const transcribedText = fs.readFileSync(transcriptTxtPath!, "utf-8").trim();
    console.log("Transcription:", transcribedText);

    if (!transcribedText) {
      throw new Error("Transcription is empty");
    }

    //METRICS CALCULATION 
    const words = transcribedText.trim().split(/\s+/);
    const wordCount = words.length;
    const durationMinutes = Number(durationSeconds) / 60;
    const rateOfSpeech = Math.max(1, Math.round(wordCount / Math.max(durationMinutes, 0.1)));

    const fillerWords = ["uh", "um", "like", "you know", "hmm", "ah", "er", "so", "and yeah", "and ya", "basically"];
    const fillerWordCount = words.filter((word: string) =>
      fillerWords.includes(word.toLowerCase().replace(/[.,!?]/g, ""))
    ).length;

    const fillerRatio = fillerWordCount / Math.max(wordCount, 1);

    // Calculate fluency score with same algorithm as freetopic
    let fluencyScore = 10 - fillerRatio * 60;

    const normalizedWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
    const uniqueWords = new Set(normalizedWords);
    const uniqueRatio = uniqueWords.size / Math.max(normalizedWords.length, 1);

    // Repetition: longest consecutive run of the same token
    let maxRun = 1, run = 1;
    for (let i = 1; i < normalizedWords.length; i++) {
      if (normalizedWords[i] === normalizedWords[i - 1]) run++;
      else { if (run > maxRun) maxRun = run; run = 1; }
    }
    if (run > maxRun) maxRun = run;

    // Bigram diversity
    let distinctBigrams = 0;
    if (normalizedWords.length > 1) {
      const bigrams = new Set<string>();
      for (let i = 1; i < normalizedWords.length; i++) {
        bigrams.add(`${normalizedWords[i - 1]} ${normalizedWords[i]}`);
      }
      distinctBigrams = bigrams.size;
    }
    const bigramRatio = normalizedWords.length > 1 ? distinctBigrams / (normalizedWords.length - 1) : 0;

    // Average word length
    const totalChars = normalizedWords.reduce((s, w) => s + w.length, 0);
    const avgWordLen = normalizedWords.length ? totalChars / normalizedWords.length : 0;

    // Non-alphabetical ratio
    const raw = transcribedText;
    const alphaChars = (raw.match(/[a-z]/gi) || []).length;
    const nonAlphaChars = raw.replace(/\s/g, '').length - alphaChars;
    const nonAlphaRatio = (nonAlphaChars) / Math.max(alphaChars + nonAlphaChars, 1);

    // Apply strict caps
    function cap(score: number, maxCap: number) { return Math.min(score, maxCap); }

    // Content length caps
    if (wordCount < 30) fluencyScore = cap(fluencyScore, 4);
    else if (wordCount < 60) fluencyScore = cap(fluencyScore, 5);
    else if (wordCount < 100) fluencyScore = cap(fluencyScore, 6);

    // Speaking rate caps
    if (rateOfSpeech < 80 || rateOfSpeech > 180) fluencyScore = cap(fluencyScore, 5);
    if (rateOfSpeech < 70 || rateOfSpeech > 200) fluencyScore = cap(fluencyScore, 4);

    // Repetition caps
    if (maxRun >= 6) fluencyScore = cap(fluencyScore, 4);
    else if (maxRun >= 4) fluencyScore = cap(fluencyScore, 5);

    // Diversity caps
    if (uniqueRatio < 0.55) fluencyScore = cap(fluencyScore, 4);
    else if (uniqueRatio < 0.70) fluencyScore = cap(fluencyScore, 5);

    if (bigramRatio < 0.40) fluencyScore = cap(fluencyScore, 4);
    else if (bigramRatio < 0.60) fluencyScore = cap(fluencyScore, 5);

    // Gibberish-ish cues
    if (avgWordLen < 3.6) fluencyScore = cap(fluencyScore, 6);
    if (nonAlphaRatio > 0.15) fluencyScore = cap(fluencyScore, 5);

    // Finalize
    fluencyScore = Math.round(fluencyScore);
    fluencyScore = Math.max(1, Math.min(10, fluencyScore));

    // ========== EXTRACT AUDIO FEATURES ==========
    console.log("Extracting audio features from WAV file...");
    const audioFeatures = extractAudioFeatures(wavPath!);

    // ========== CALCULATE CONFIDENCE USING AUDIO FEATURES ==========
    console.log("Calculating confidence with audio analysis...");
    const calculatedConfidence = calculateConfidenceCategory(audioFeatures, {
      rateOfSpeech,
      fillerWordCount,
      fluencyScore,
      durationMinutes
    });

    console.log("Generating AI feedback...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // Create prompt with interview context
    const questionsText = questions.map((q: string, i: number) => `Q${i + 1}: ${q}`).join("\n");

    const prompt = `
You are an expert interview coach. Analyze the following interview responses with detailed audio and speech metrics.

Candidate Profile:
- Role: ${user.role === "student" ? "Student" : "Working Professional"}
- Age: ${user.age}

Interview Questions Asked:
${questionsText}

Complete Interview Transcription (All Answers Combined):
"${transcribedText}"

Audio Analysis Results:
- Volume Level: ${audioFeatures.volume.toFixed(3)} (0-1 scale, optimal: 0.2-0.7)
- Pitch Variation: ${audioFeatures.pitchVariance.toFixed(1)} Hz (optimal: >30Hz)
- Energy Level: ${audioFeatures.energy.toFixed(3)} (0-1 scale, optimal: >0.3)
- Speech Consistency: ${audioFeatures.consistency.toFixed(3)} (0-1 scale, optimal: >0.6)
- Average Pitch: ${audioFeatures.averagePitch.toFixed(1)} Hz (typical: 80-300Hz)
- Pitch Range: ${audioFeatures.pitchRange.toFixed(1)} Hz (optimal: >50Hz)

Speech Metrics:
- Total Word Count: ${wordCount}
- Average Rate of Speech: ${rateOfSpeech} words per minute (optimal: 120-160)
- Filler Words Used: ${fillerWordCount} (optimal: <5)
- Fluency Score: ${fluencyScore}/10
- Total Duration: ${durationMinutes.toFixed(2)} minutes

CALCULATED CONFIDENCE CATEGORY: ${calculatedConfidence}

Please provide comprehensive feedback in the following JSON format:
{
  "confidenceCategory": "${calculatedConfidence}",
  "whatWentWell": ["point1", "point2", "point3"],
  "areasForImprovement": ["point1", "point2", "point3"],
  "sentenceImprovements": [
    {
      "original": "unpolished sentence from the responses",
      "improved": "enhanced version of the sentence"
    }
  ],
  "vocabularyAnalysis": {
    "sophisticatedWords": ["word1", "word2", "word3"],
    "vocabularyScore": 8.5,
    "reasoning": "Brief explanation of vocabulary assessment"
  }
}

STRICT OUTPUT RULES:
- Use the calculated confidence category: "${calculatedConfidence}"
- Output STRICT JSON only. No markdown, no code fences, no extra commentary.
- Every value must be valid JSON. Do not add parenthetical notes outside of strings.
- Do not use placeholders like "For example..." or instructions in values; write complete improved sentences.

Evaluation Criteria:
1. **Confidence Assessment**: Analyze tone, energy level, consistency, and speaking patterns. Consider that ${user.role === "work" ? "working professionals typically have more developed interview skills" : "students are still developing their professional communication skills"}.

2. **Content Relevance**: Evaluate how well the responses address the interview questions. Look for specific examples, structured answers (STAR method), and relevance.

3. **Communication Skills**: Assess clarity, coherence, vocabulary usage, and overall communication effectiveness.

4. **Areas of Strength**: Identify 3 specific positive aspects of the interview performance.

5. **Improvement Areas**: Suggest 3 concrete areas where the candidate can improve.

6. **Sentence Improvements**: Provide 3-4 examples of actual sentences from the transcription that could be improved, along with better alternatives.

7. **Vocabulary Analysis**: 
   - Identify 3-10 sophisticated, professional, or advanced vocabulary words from the transcription
   - Provide a vocabulary score (0-10) based on:
     * Sophistication and appropriateness of word choice
     * Use of professional terminology relevant to the role
     * Variety in vocabulary (avoiding repetition)
     * Appropriate level of formality
     * Precision in language use
   - Provide brief reasoning for the vocabulary score

Provide actionable, specific, and encouraging feedback that helps the candidate improve their interview skills.
`;

const result = await model.generateContent(prompt);
const responseText = result.response.text();

console.log("AI Response:", responseText);

// Extract JSON from response safely
function extractJson(text: string) {
  // remove markdown fences if present
  const stripped = text.replace(/```json|```/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  return (match ? match[0] : stripped).trim();
}

let feedbackData: any;
try {
  const jsonStr = extractJson(responseText)
    .replace(/[""]/g, '"')  // normalize curly quotes
    .replace(/['']/g, "'");
  feedbackData = JSON.parse(jsonStr);
} catch (e) {
  console.warn("Failed to parse AI JSON, using calculated confidence. Error:", e);
  feedbackData = {
    confidenceCategory: calculatedConfidence,
    whatWentWell: [
      "You completed the entire interview",
      "You provided responses to all questions",
      "You maintained engagement throughout"
    ],
    areasForImprovement: [
      "Improve structure and clarity of answers (use STAR method)",
      "Provide more specific examples tailored to the questions",
      "Project more confidence and reduce filler words"
    ],
    sentenceImprovements: [],
    vocabularyAnalysis: {
      sophisticatedWords: [],
      vocabularyScore: 5.0,
      reasoning: "Unable to analyze vocabulary due to parsing error"
    }
  };
}

// Extract vocabulary score from AI analysis
let vocabularyScore = 5.0; // Default fallback
if (feedbackData.vocabularyAnalysis && feedbackData.vocabularyAnalysis.vocabularyScore) {
  vocabularyScore = Math.max(1, Math.min(10, feedbackData.vocabularyAnalysis.vocabularyScore));
}

// If AI provided sophisticated words, use them for additional validation
if (feedbackData.vocabularyAnalysis && feedbackData.vocabularyAnalysis.sophisticatedWords) {
  const sophisticatedWords: string[] = feedbackData.vocabularyAnalysis.sophisticatedWords;
  const vocabWords = transcribedText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  
  // Count how many sophisticated words were actually used
  const sophisticatedWordCount = sophisticatedWords.filter((word: string) => 
    vocabWords.includes(word.toLowerCase())
  ).length;
  
  // Calculate ratio of sophisticated words to total words
  const sophisticatedRatio = sophisticatedWordCount / Math.max(vocabWords.length, 1);
  
  // Apply scaling factor that rewards longer, well-articulated responses
  const scalingFactor = Math.min(12, Math.max(8, vocabWords.length / 15));
  const calculatedScore = Math.min(10, sophisticatedRatio * scalingFactor * 10);
  
  // Use the higher of AI score or calculated score (with 70% weight to AI assessment)
  vocabularyScore = (feedbackData.vocabularyAnalysis.vocabularyScore * 0.7) + (calculatedScore * 0.3);
}

// Ensure vocabulary score is within bounds
vocabularyScore = Math.max(1, Math.min(10, Math.round(vocabularyScore * 10) / 10));

    // Create recording entry
    const recording = {
      scenario: "AI Interview Simulation",
      transcription: transcribedText,
      durationMinutes: parseFloat(durationMinutes.toFixed(2)),
      fillerWordCount,
      feedback: {
        confidenceCategory: feedbackData.confidenceCategory,
        rateOfSpeech,
        fluencyScore
      }
    };

    // Update user statistics
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

    console.log("=== Interview Processing Complete ===");

    return res.status(200).json({
      message: "Interview processed successfully",
      transcription: transcribedText,
      metrics: {
        rateOfSpeech,
        fluencyScore,
        confidenceCategory: feedbackData.confidenceCategory,
        fillerWordCount,
        durationMinutes: parseFloat(durationMinutes.toFixed(2)),
        vocabularyScore
      },
      feedback: feedbackData
    });

  } catch (err: any) {
    console.error("=== Error Processing Interview ===");
    console.error(err);
    return res.status(500).json({
      message: "Server error processing interview",
      error: err?.message || String(err)
    });
  } finally {
    // Cleanup temp files
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