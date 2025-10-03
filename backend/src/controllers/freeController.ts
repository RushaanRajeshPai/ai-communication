import { Request, Response } from "express";
import User from "../models/User";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Server as SocketIOServer } from "socket.io";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const conversations = new Map<string, {
  history: Array<{ role: 'user' | 'assistant', content: string }>,
  userId: string,
  startTime: Date,
  silenceWarnings: number
}>();

export const initializeFreeConversation = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversationId = `conv_${userId}_${Date.now()}`;
    conversations.set(conversationId, {
      history: [],
      userId,
      startTime: new Date(),
      silenceWarnings: 0
    });

    return res.status(200).json({
      message: "Conversation initialized",
      conversationId,
      userInfo: {
        fullname: user.fullname,
        age: user.age,
        gender: user.gender,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error("Error initializing conversation:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
};

export const handleFreeConversationMessage = async (
  conversationId: string,
  userMessage: string,
  io: SocketIOServer
) => {
  try {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const user = await User.findById(conversation.userId);
    if (!user) {
      throw new Error("User not found");
    }

    conversation.history.push({ role: 'user', content: userMessage });
    conversation.silenceWarnings = 0;

    const systemPrompt = `You are a friendly, conversational AI assistant. You're having a natural spoken conversation with ${user.fullname}, a ${user.age}-year-old ${user.gender} ${user.role === 'student' ? 'student' : 'working professional'}.

Guidelines:
- Keep responses concise (2-4 sentences max) since this is spoken conversation
- Be warm, engaging, and natural
- Remember context from earlier in the conversation
- If asked about the user's personal info, you know: name is ${user.fullname}, age is ${user.age}, gender is ${user.gender}, role is ${user.role}
- Respond as if speaking, not writing (avoid lists, use natural speech patterns)`;

    const conversationContext = conversation.history.slice(-10).map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const prompt = `${systemPrompt}\n\nConversation so far:\n${conversationContext}\n\nRespond naturally to the user's last message.`;

    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text().trim();

    conversation.history.push({ role: 'assistant', content: aiResponse });

    io.to(conversationId).emit('ai-response', { 
      text: aiResponse,
      conversationId 
    });

  } catch (err: any) {
    console.error("Error processing message:", err);
    io.to(conversationId).emit('error', { 
      message: "Failed to process message",
      error: err?.message 
    });
  }
};

export const handleSilenceTimeout = async (
  conversationId: string,
  io: SocketIOServer
) => {
  try {
    const conversation = conversations.get(conversationId);
    if (!conversation) return;

    conversation.silenceWarnings++;

    let response = "";
    if (conversation.silenceWarnings === 1) {
      response = "Hey, are you there?";
    } else if (conversation.silenceWarnings >= 2) {
      response = "Okay i am guessing you have left and I would end this conversation.";
      
      setTimeout(() => {
        io.to(conversationId).emit('conversation-ended', { reason: 'inactivity' });
        endFreeConversation(conversationId);
      }, 3000);
    }

    conversation.history.push({ role: 'assistant', content: response });
    io.to(conversationId).emit('ai-response', { 
      text: response,
      conversationId,
      isSilenceWarning: true
    });

  } catch (err: any) {
    console.error("Error handling silence:", err);
  }
};

export const endFreeConversation = async (conversationId: string) => {
  try {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const user = await User.findById(conversation.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const fullTranscript = conversation.history
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join(' ');

    // Only save recording if there's actual user content
    if (fullTranscript.trim()) {
      const words = fullTranscript.trim().split(/\s+/);
      const wordCount = words.length;
      
      const durationMinutes = (new Date().getTime() - conversation.startTime.getTime()) / 60000;
      const userSpeakingMinutes = durationMinutes * 0.6;
      const rateOfSpeech = Math.max(1, Math.round(wordCount / Math.max(userSpeakingMinutes, 0.1)));

      const fillerWords = ["uh", "um", "like", "you know", "hmm", "ah", "er", "so", "basically"];
      const fillerWordCount = words.filter((word: string) =>
        fillerWords.includes(word.toLowerCase().replace(/[.,!?]/g, ""))
      ).length;

      const fillerRatio = fillerWordCount / Math.max(wordCount, 1);
      let fluencyScore = 10 - fillerRatio * 60;

      const normalizedWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
      const uniqueWords = new Set(normalizedWords);
      const uniqueRatio = uniqueWords.size / Math.max(normalizedWords.length, 1);

      if (wordCount < 30) fluencyScore = Math.min(fluencyScore, 4);
      else if (wordCount < 60) fluencyScore = Math.min(fluencyScore, 5);
      else if (wordCount < 100) fluencyScore = Math.min(fluencyScore, 6);

      if (rateOfSpeech < 80 || rateOfSpeech > 180) fluencyScore = Math.min(fluencyScore, 5);
      if (uniqueRatio < 0.55) fluencyScore = Math.min(fluencyScore, 4);

      fluencyScore = Math.round(Math.max(1, Math.min(10, fluencyScore)));

      let confidenceCategory: "monotone" | "confident" | "hesitant" = "monotone";
      if (fluencyScore >= 7 && fillerWordCount <= 5 && rateOfSpeech >= 100 && rateOfSpeech <= 160) {
        confidenceCategory = "confident";
      } else if (fluencyScore <= 4 || fillerWordCount >= 10 || rateOfSpeech < 80) {
        confidenceCategory = "hesitant";
      }

      // OPTIMIZATION 1: Use a faster, lighter model for feedback generation
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Faster than gemini-2.5-pro
      
      // OPTIMIZATION 2: Reduce the conversation summary length
      const conversationSummary = conversation.history.slice(0, 10).map(msg => // Reduced from 20 to 10
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n');

      // OPTIMIZATION 3: Simplified feedback prompt
      const feedbackPrompt = `Provide brief feedback for a conversation.

User: ${user.fullname}, ${user.age} years old, ${user.role}

Metrics: ${wordCount} words, ${rateOfSpeech} WPM, ${fillerWordCount} fillers, Fluency ${fluencyScore}/10

Provide feedback in JSON format:
{
  "shortFeedback": "2 brief sentences (encouraging tone)",
  "detailedFeedback": {
    "strengths": ["strength1", "strength2"],
    "improvements": ["improvement1", "improvement2"],
    "overallAssessment": "brief assessment"
  }
}`;

      // OPTIMIZATION 4: Add timeout to the API call with proper error handling
      let result: any;
      try {
        result = await Promise.race([
          model.generateContent(feedbackPrompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 8000) // 8 second timeout
          )
        ]);
      } catch (timeoutError) {
        console.log('AI feedback generation timed out, using fallback feedback');
        result = null; // Set result to null to trigger fallback
      }
      
      let feedbackData: any;
      if (result && result.response) {
        try {
          const responseText = result.response.text().trim();
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          feedbackData = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
        } catch {
          // If JSON parsing fails, use fallback
          result = null;
        }
      }
      
      // Use fallback feedback if AI call failed or timed out
      if (!result || !result.response) {
        feedbackData = {
          shortFeedback: fluencyScore >= 5 
            ? "You did well in this conversation! Your communication was clear and engaging. Keep practicing to build even more confidence."
            : "Thanks for the conversation. There's room for improvement in fluency and clarity. Keep practicing to enhance your communication skills.",
          detailedFeedback: {
            strengths: ["Completed the conversation", "Engaged with the AI"],
            improvements: ["Reduce filler words", "Improve speaking pace"],
            overallAssessment: "A good effort overall."
          }
        };
      }

      const recording = {
        scenario: "Free Conversation",
        transcription: fullTranscript,
        durationMinutes: parseFloat(durationMinutes.toFixed(2)),
        fillerWordCount,
        feedback: {
          confidenceCategory,
          rateOfSpeech,
          fluencyScore
        }
      };

      // OPTIMIZATION 6: Save to database asynchronously (don't wait for it)
      setImmediate(async () => {
        try {
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
        } catch (err) {
          console.error('Error saving user data:', err);
        }
      });

      conversations.delete(conversationId);

      return {
        success: true,
        metrics: {
          fluencyScore,
          rateOfSpeech,
          confidenceCategory,
          fillerWordCount,
          durationMinutes: parseFloat(durationMinutes.toFixed(2))
        },
        feedback: feedbackData
      };
    } else {
      // No user content - just clean up the conversation
      conversations.delete(conversationId);
      
      return {
        success: true,
        metrics: {
          fluencyScore: 0,
          rateOfSpeech: 0,
          confidenceCategory: "hesitant" as const,
          fillerWordCount: 0,
          durationMinutes: 0
        },
        feedback: {
          shortFeedback: "Thanks for trying out the conversation feature. Feel free to start a new conversation when you're ready to practice speaking!",
          detailedFeedback: {
            strengths: ["Attempted to use the feature"],
            improvements: ["Try speaking more to get better feedback"],
            overallAssessment: "No conversation content to analyze. Please try again with some spoken input."
          }
        }
      };
    }

  } catch (err: any) {
    console.error("Error ending conversation:", err);
    throw err;
  }
};

export const getFreeConversationFeedback = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    
    const result = await endFreeConversation(conversationId);
    
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Error getting feedback:", err);
    return res.status(500).json({ 
      message: "Error generating feedback",
      error: err?.message 
    });
  }
};