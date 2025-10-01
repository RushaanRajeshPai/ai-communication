import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Check, X } from "lucide-react";
import whitelogo from "../assets/whitelogo.png";

interface InterviewMetrics {
  rateOfSpeech: number;
  fluencyScore: number;
  confidenceCategory: "monotone" | "confident" | "hesitant";
  fillerWordCount: number;
  durationMinutes: number;
}

interface SentenceImprovement {
  original: string;
  improved: string;
}

interface InterviewFeedback {
  confidenceCategory: "monotone" | "confident" | "hesitant";
  whatWentWell: string[];
  areasForImprovement: string[];
  sentenceImprovements: SentenceImprovement[];
}

interface InterviewResponse {
  message: string;
  transcription: string;
  metrics: InterviewMetrics;
  feedback: InterviewFeedback;
}

const INTERVIEW_QUESTIONS = [
  "Tell me about yourself and your background.",
  "What are your greatest strengths?",
  "What is your biggest weakness and how are you working to improve it?",
  "Why do you want to work for this company?",
  "Describe a challenging situation you faced and how you handled it.",
  "Where do you see yourself in five years?",
  "How do you handle stress and pressure?",
  "Tell me about a time you demonstrated leadership skills.",
  "What motivates you to do your best work?",
  "Do you have any questions for us?"
];

const Interview = () => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewCompleted, setInterviewCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InterviewResponse | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const allAudioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const userId = localStorage.getItem("userId");

  useEffect(() => {
    return () => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakQuestion = (questionText: string) => {
    return new Promise<void>((resolve) => {
      if (!window.speechSynthesis) {
        console.error("Speech synthesis not supported");
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(questionText);
      utteranceRef.current = utterance;
      
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.includes("Female") || 
        voice.name.includes("Samantha") ||
        voice.name.includes("Victoria") ||
        voice.name.includes("Karen") ||
        (voice.name.includes("Google") && voice.name.includes("UK"))
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 1;

      utterance.onstart = () => {
        setIsAISpeaking(true);
      };

      utterance.onend = () => {
        setIsAISpeaking(false);
        utteranceRef.current = null;
        resolve();
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        setIsAISpeaking(false);
        utteranceRef.current = null;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const startInterview = async () => {
    if (!userId) {
      setError("User not logged in. Please log in to start the interview.");
      return;
    }

    setInterviewStarted(true);
    setError(null);
    
    if (window.speechSynthesis.getVoices().length === 0) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.onvoiceschanged = () => resolve();
        setTimeout(resolve, 100);
      });
    }

    await speakQuestion(INTERVIEW_QUESTIONS[0]);
    startRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      const preferred =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

      mimeTypeRef.current = preferred || "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          allAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      
      if (currentQuestion === 0) {
        startTimeRef.current = Date.now();
      }
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.onstop = () => {
          resolve();
        };
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } else {
        resolve();
      }
    });
  };

  const nextQuestion = async () => {
    await stopRecording();

    if (currentQuestion < INTERVIEW_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      await speakQuestion(INTERVIEW_QUESTIONS[currentQuestion + 1]);
      startRecording();
    } else {
      await completeInterview();
    }
  };

  const completeInterview = async () => {
    setIsProcessing(true);
    
    try {
      const fullAudioBlob = new Blob(allAudioChunksRef.current, { type: mimeTypeRef.current });
      const totalDuration = (Date.now() - startTimeRef.current) / 1000;

      const reader = new FileReader();
      reader.readAsDataURL(fullAudioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;

        try {
          const response = await fetch("http://localhost:5000/api/interview/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId,
              audioFile: base64Audio,
              durationSeconds: totalDuration,
              questions: INTERVIEW_QUESTIONS
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const detail = errorData?.error || errorData?.message || "Failed to process interview";
            throw new Error(detail);
          }

          const data: InterviewResponse = await response.json();
          setResults(data);
          setInterviewCompleted(true);
        } catch (err: any) {
          console.error("Error processing interview:", err);
          setError(err.message || "Failed to process interview. Please try again.");
        } finally {
          setIsProcessing(false);
        }
      };

      reader.onerror = () => {
        setError("Failed to read audio file");
        setIsProcessing(false);
      };
    } catch (err: any) {
      console.error("Error completing interview:", err);
      setError("Failed to complete interview. Please try again.");
      setIsProcessing(false);
    }
  };

  const PentagonChart = ({ metrics }: { metrics: InterviewMetrics }) => {
    const confidenceScore =
      metrics.confidenceCategory === "confident" ? 8 :
      metrics.confidenceCategory === "monotone" ? 5 : 3;
    const fillerScore = Math.max(0, 10 - metrics.fillerWordCount);
    const rateScore = Math.min(10, Math.max(0, (metrics.rateOfSpeech / 150) * 10));
  
    const points = [
        { label: "Rate of Speech", value: rateScore, tooltip: `Speech Rate: ${metrics.rateOfSpeech} WPM` },
      { label: "Confidence", value: confidenceScore, tooltip: `Confidence: ${metrics.confidenceCategory}` },
      
      { label: "Fluency", value: metrics.fluencyScore, tooltip: `Fluency Score: ${metrics.fluencyScore}/10` },
      { label: "Filler Words", value: fillerScore, tooltip: `Filler Words: ${metrics.fillerWordCount}` },
      { label: "Duration", value: Math.min(10, metrics.durationMinutes * 5), tooltip: `Duration: ${Math.round(metrics.durationMinutes * 60)} sec` },
    ];
  
    const size = 450;
    const center = size / 2;
    const radius = size / 2 - 90;
    const angleStep = (Math.PI * 2) / points.length;
  
    const calculatePoint = (index: number, value: number) => {
      const angle = angleStep * index - Math.PI / 2;
      const r = (value / 10) * radius;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
      };
    };
  
    const dataPoints = points.map((p, i) => calculatePoint(i, p.value));
    const maxPoints = points.map((_, i) => calculatePoint(i, 10));
    const pathData = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    const maxPathData = maxPoints
    .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ") + " Z";  
  
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
    return (
      <div className="flex flex-col items-center relative">
        <svg width={size} height={size} className="mb-4">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="tooltipGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8"/>
            </linearGradient>
          </defs>
  
          <path d={maxPathData} fill="none" stroke="rgba(71, 85, 105, 0.5)" strokeWidth="2" />
  
          {maxPoints.map((point, i) => (
            <line 
              key={i} 
              x1={center} 
              y1={center} 
              x2={point.x} 
              y2={point.y} 
              stroke="rgba(40, 50, 65, 0.5)" 
              strokeWidth="2" 
            />
          ))}
  
          {[0.33, 0.66, 1].map((scale, idx) => {
            const ringPoints = points.map((_, i) => calculatePoint(i, 10 * scale));
            const ringPath = ringPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
            return (
              <path
                key={idx}
                d={ringPath}
                fill="rgba(148, 163, 184, 0.1)"
                stroke="rgba(40, 50, 65, 0.5)"
                strokeWidth="2"
              />
            );
          })}
  
          <path 
            d={pathData} 
            fill="rgba(96, 165, 250, 0.4)" 
            stroke="#3b82f6" 
            strokeWidth="2.5"
            filter="url(#glow)"
          />
  
          {dataPoints.map((point, i) => (
            <g
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={point.x} cy={point.y} r="6" fill="#1e3a8a" opacity="0.5" />
              <circle cx={point.x} cy={point.y} r="4" fill="#60a5fa" filter="url(#glow)" />
  
              {hoveredIndex === i && (
                <g>
                  <rect
                    x={point.x + 12}
                    y={point.y - 28}
                    width={150}
                    height={28}
                    rx={6}
                    fill="url(#tooltipGradient)"
                    stroke="#ffffff55"
                    strokeWidth={1}
                  />
                  <text
                    x={point.x + 18}
                    y={point.y - 10}
                    fill="white"
                    fontSize="13"
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {points[i].tooltip}
                  </text>
                </g>
              )}
            </g>
          ))}
  
          {maxPoints.map((point, i) => {
            const angle = angleStep * i - Math.PI / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const labelR = radius + 35;
            const labelX = center + labelR * cos;
            const labelY = center + labelR * sin;
  
            const adjustedX = i === 1 ? labelX + 12 : labelX;
            const adjustedY = i === 0 ? labelY + 8 : labelY;
  
            return (
              <text
                key={i}
                x={adjustedX}
                y={adjustedY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-base font-medium"
                fill="#cbd5e1"
                style={{ letterSpacing: "0.5px" }}
              >
                {points[i].label}
              </text>
            );
          })}
        </svg>
      </div>
    );
  };

  if (!interviewStarted) {
    return (
      <div className="w-screen min-h-screen text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(27, 31, 46, 0.8)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex-shrink-0">
                <div className="w-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}>
                  <img src={whitelogo} alt="" />
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI Interview Simulation
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-12 max-w-2xl">
              Practice your interview skills with AI-powered feedback on 10 common interview questions
            </p>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 max-w-2xl border border-white/20">
              <h3 className="font-semibold text-blue-300 mb-3 text-lg">Interview Format:</h3>
              <ul className="text-gray-300 space-y-2 text-left text-sm">
                <li className="flex gap-3"><span className="text-blue-400">•</span>10 common interview questions</li>
                <li className="flex gap-3"><span className="text-blue-400">•</span>AI interviewer will ask each question via voice</li>
                <li className="flex gap-3"><span className="text-blue-400">•</span>Respond naturally to each question</li>
                <li className="flex gap-3"><span className="text-blue-400">•</span>Click "Next Question" when you're done answering</li>
                <li className="flex gap-3"><span className="text-blue-400">•</span>Receive detailed feedback after completion</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-600/20 border border-red-500/50 p-4 rounded-lg mb-6 max-w-2xl">
                <p className="text-red-300">{error}</p>
              </div>
            )}

            <button
              onClick={startInterview}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105 shadow-lg"
            >
              Start Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="w-screen min-h-screen text-white flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 max-w-md text-center border border-white/20">
          <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">
            Processing Your Interview
          </h2>
          <p className="text-gray-300">
            Analyzing your responses and generating personalized feedback...
          </p>
        </div>
      </div>
    );
  }

  if (interviewCompleted && results) {
    return (
      <div className="w-screen min-h-screen text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(27, 31, 46, 0.8)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex-shrink-0">
                <div className="w-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}>
                  <img src={whitelogo} alt="" />
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
          <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-center mt-12 mb-8">Your Interview Analysis</h1>

            {/* Pentagon Chart */}
            <div className="bg-gradient-to-b from-gray-800 to-black rounded-2xl p-6 md:p-8">
              <h2 className="text-2xl font-bold text-center">Performance Insights</h2>
              <PentagonChart metrics={results.metrics} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 -mt-12">
                <div className="bg-blue-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{results.metrics.rateOfSpeech}</div>
                  <div className="text-sm text-gray-300">Words/Min</div>
                </div>
                <div className="bg-purple-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{results.metrics.fluencyScore}/10</div>
                  <div className="text-sm text-gray-300">Fluency</div>
                </div>
                <div className="bg-green-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold capitalize">{results.metrics.confidenceCategory}</div>
                  <div className="text-sm text-gray-300">Confidence Category</div>
                </div>
                <div className="bg-orange-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{results.metrics.fillerWordCount}</div>
                  <div className="text-sm text-gray-300">Filler Words</div>
                </div>
              </div>
            </div>

            {/* Feedback Section */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-green-900/30 backdrop-blur-lg rounded-2xl p-6 border border-green-500/30">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Check className="text-green-400" />
                  What You Did Well
                </h3>
                <ul className="space-y-3">
                  {results.feedback.whatWentWell.map((point, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-green-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-orange-900/30 backdrop-blur-lg rounded-2xl p-6 border border-orange-500/30">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <X className="text-red-400" />
                  Areas for Improvement
                </h3>
                <ul className="space-y-3">
                  {results.feedback.areasForImprovement.map((point, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-red-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Sentence Improvements */}
            {results.feedback.sentenceImprovements.length > 0 && (
              <div className="bg-gradient-to-b from-gray-800 to-black backdrop-blur-lg rounded-2xl p-6 md:p-8">
                <h3 className="text-2xl font-bold mb-6">Sentence Enhancements</h3>
                <div className="space-y-6">
                  {results.feedback.sentenceImprovements.map((item, i) => (
                    <div key={i} className="grid md:grid-cols-2 gap-4">
                      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                        <div className="text-xs font-semibold text-red-400 mb-2">ORIGINAL</div>
                        <p className="text-sm">{item.original}</p>
                      </div>
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                        <div className="text-xs font-semibold text-green-400 mb-2">ENHANCED</div>
                        <p className="text-sm">{item.improved}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcription */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-white/20">
              <h3 className="text-2xl font-bold mb-4">Full Transcription</h3>
              <div className="bg-black/30 rounded-lg p-4 max-h-64 overflow-y-auto">
                <p className="text-gray-300 leading-relaxed">{results.transcription}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
              >
                Practice Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Interview UI
  return (
    <div className="w-screen min-h-screen text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: "rgba(27, 31, 46, 0.8)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex-shrink-0">
              <div className="w-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}>
                <img src={whitelogo} alt="" />
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-4xl mx-auto">
          {/* Progress Bar */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-300">
                Question {currentQuestion + 1} of {INTERVIEW_QUESTIONS.length}
              </span>
              <span className="text-sm font-medium text-gray-300">
                {Math.round(((currentQuestion + 1) / INTERVIEW_QUESTIONS.length) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${((currentQuestion + 1) / INTERVIEW_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Interviewer Section */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
            <div className="flex flex-col items-center mb-6">
              {/* AI Avatar */}
              <div className="relative mb-6">
                <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-xl ${isAISpeaking ? "animate-pulse ring-4 ring-indigo-300" : ""}`}>
                  <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center">
                    <svg className="w-20 h-20 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
                {isAISpeaking && (
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                )}
              </div>

              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                AI Interviewer
              </h2>
              <div className="bg-blue-600/20 border-2 border-blue-400 rounded-xl p-6 w-full">
                <p className="text-xl text-center font-medium">
                  {INTERVIEW_QUESTIONS[currentQuestion]}
                </p>
              </div>
            </div>

            {/* Recording Status */}
            <div className="flex items-center justify-center mb-6">
              {isRecording ? (
                <div className="flex items-center space-x-3 bg-red-600/20 px-6 py-3 rounded-full border-2 border-red-500">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <Mic className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 font-semibold">Recording your answer...</span>
                </div>
              ) : isAISpeaking ? (
                <div className="flex items-center space-x-3 bg-indigo-600/20 px-6 py-3 rounded-full border-2 border-indigo-500">
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  <span className="text-indigo-400 font-semibold">AI is speaking...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-3 bg-gray-600/20 px-6 py-3 rounded-full border-2 border-gray-500">
                  <MicOff className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-400 font-semibold">Ready</span>
                </div>
              )}
            </div>

            {/* Recording Animation */}
            {isRecording && (
              <div className="flex justify-center mb-6">
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-3 h-12 bg-red-500 rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Next Button */}
            <button
              onClick={nextQuestion}
              disabled={!isRecording || isAISpeaking}
              className={`w-full py-4 rounded-lg font-semibold text-lg transition-all shadow-lg ${
                isRecording && !isAISpeaking
                  ? "bg-green-600 hover:bg-green-700 text-white transform hover:scale-105"
                  : "bg-gray-600 text-gray-400 cursor-not-allowed"
              }`}
            >
              {currentQuestion === INTERVIEW_QUESTIONS.length - 1
                ? "Complete Interview"
                : "Next Question"}
            </button>
          </div>

          {error && (
            <div className="bg-red-600/20 border border-red-500/50 p-4 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Interview;