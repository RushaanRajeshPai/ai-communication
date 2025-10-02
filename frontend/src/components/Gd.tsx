import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Users, MessageCircle, Loader2, Trophy, Check, X } from 'lucide-react';
import whitelogo from "../assets/whitelogo.png";
import BotAvatar from "./BotAvatar";

interface Bot {
  name: string;
  speaking: boolean;
  lastMessage?: string;
}

interface Message {
  speaker: string;
  text: string;
  timestamp: number;
  isUser: boolean;
}

interface Metrics {
  rateOfSpeech: number;
  fluencyScore: number;
  confidenceCategory: string;
  fillerWordCount: number;
  durationMinutes: number;
}

interface Feedback {
  confidenceCategory: string;
  whatWentWell: string[];
  areasForImprovement: string[];
  keyStrengths?: string[];
  participationQuality?: string;
}

export default function Gd() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [bots, setBots] = useState<Bot[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [discussionStarted, setDiscussionStarted] = useState(false);
  const [discussionEnded, setDiscussionEnded] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string>('');
  
  // New states for Bot Avatars
  const [currentSpeakingBot, setCurrentSpeakingBot] = useState<string | null>(null);
  const [currentBotText, setCurrentBotText] = useState<string>('');
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedUserId = localStorage.getItem('userId');

    if (storedUserId) {
      setUserId(storedUserId);
      console.log("User ID loaded from 'userId':", storedUserId);
      return;
    }

    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        const id = userData._id || userData.id;
        if (id) {
          setUserId(id);
          console.log("User ID loaded from 'user':", id);
        }
      } catch (e) {
        console.error("Failed to parse user data:", e);
      }
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startDiscussion = async () => {
    try {
      setError('');
      const response = await fetch(`${API_URL}/api/gd/topic`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to start discussion');

      const data = await response.json();
      setSessionId(data.sessionId);
      setTopic(data.topic);
      setBots(data.bots.map((b: any) => ({ ...b, speaking: false })));
      setDiscussionStarted(true);
      setMessages([]);

      setTimeout(() => {
        triggerBotResponse('Initiator', 'initiate');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to start discussion');
    }
  };

  const triggerBotResponse = async (botName: string, trigger: string = 'respond') => {
    if (!sessionId) return;

    try {
      setBots(prev => prev.map(b =>
        b.name === botName ? { ...b, speaking: true } : b
      ));

      const response = await fetch(`${API_URL}/api/gd/bot-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, botName, trigger })
      });

      if (!response.ok) throw new Error('Failed to get bot response');

      const data = await response.json();

      // Set the current speaking bot and text for Bot Avatar
      setCurrentSpeakingBot(botName);
      setCurrentBotText(data.text);

      if (data.audioData) {
        const audio = new Audio(data.audioData);
        audio.play();

        audio.onended = () => {
          setBots(prev => prev.map(b => ({ ...b, speaking: false })));
          setCurrentSpeakingBot(null);
          setCurrentBotText('');

          if (trigger === 'initiate') {
            setTimeout(() => {
              const nextBot = getNextBot(botName);
              if (nextBot) triggerBotResponse(nextBot);
            }, 1000);
          }
        };
      }

      setMessages(prev => [...prev, {
        speaker: data.botName,
        text: data.text,
        timestamp: data.timestamp,
        isUser: false
      }]);

    } catch (err: any) {
      console.error('Bot response error:', err);
      setBots(prev => prev.map(b => ({ ...b, speaking: false })));
      setCurrentSpeakingBot(null);
      setCurrentBotText('');
    }
  };

  const getNextBot = (currentBot: string): string | null => {
    const botNames = bots.map(b => b.name);
    const currentIndex = botNames.indexOf(currentBot);
    if (currentIndex === -1 || currentIndex === botNames.length - 1) return null;
    return botNames[currentIndex + 1];
  };

  const getRandomBot = (): string => {
    const availableBots = bots.filter(b => !b.speaking);
    if (availableBots.length === 0) return bots[0].name;
    return availableBots[Math.floor(Math.random() * availableBots.length)].name;
  };

  const startRecording = async () => {
    try {
      setIsUserSpeaking(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsUserSpeaking(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processUserAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setError('Could not access microphone. Please grant permission.');
      setIsUserSpeaking(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processUserAudio = async (audioBlob: Blob) => {
    if (!sessionId) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;

        const response = await fetch(`${API_URL}/api/gd/transcribe-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, audioFile: base64Audio })
        });

        if (!response.ok) throw new Error('Failed to transcribe audio');

        const data = await response.json();

        setMessages(prev => [...prev, {
          speaker: 'You',
          text: data.transcription,
          timestamp: data.timestamp,
          isUser: true
        }]);

        setTimeout(() => {
          const randomBot = getRandomBot();
          triggerBotResponse(randomBot);
        }, 1500);
      };
    } catch (err: any) {
      setError(err.message || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const endDiscussionAndGetFeedback = async () => {
    if (!sessionId || !userId) {
      setError('Invalid session or user');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/gd/end-discussion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId, allAudioFiles: [] })
      });

      if (!response.ok) throw new Error('Failed to end discussion');

      const data = await response.json();
      setFeedback(data.feedback);
      setMetrics(data.metrics);
      setDiscussionEnded(true);
    } catch (err: any) {
      setError(err.message || 'Failed to get feedback');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetDiscussion = () => {
    setSessionId(null);
    setTopic('');
    setBots([]);
    setMessages([]);
    setDiscussionStarted(false);
    setDiscussionEnded(false);
    setFeedback(null);
    setMetrics(null);
    setError('');
  };

  const getBotColor = (botName: string) => {
    const colors: Record<string, string> = {
      'Initiator': 'bg-blue-500',
      'Analyst': 'bg-purple-500',
      'Contrarian': 'bg-orange-500',
      'Mediator': 'bg-green-500'
    };
    return colors[botName] || 'bg-gray-500';
  };

  const PentagonChart = ({ metrics }: { metrics: Metrics }) => {
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
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="tooltipGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
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

  if (!discussionStarted) {
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
        <div className="max-w-4xl mx-auto mb-12 flex flex-col items-center justify-center">
          <div className="text-center mt-32 flex flex-col items-center justify-center text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI Group Discussion Simulation
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-12 max-w-2xl">
              Practice your group discussion skills with AI participants and get valuable feedback on your performance
            </p>
          </div>

          <div className="bg-gradient-to-b from-gray-800 to-black rounded-2xl shadow-xl p-8 px-12  max-w-2xl flex flex-col items-center justify-center">
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <MessageCircle className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg text-cyan-400 mb-2">How it works</h3>
                  <ul className="text-gray-300 space-y-2">
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>You'll be given a topic to discuss with 4 AI bots</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Each bot has a unique role and perspective</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Use your microphone to jump into the conversation</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>The discussion is transcribed in real-time</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Get detailed AI-powered feedback at the end</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <Trophy className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg text-cyan-400 mb-2">Evaluation Criteria</h3>
                  <ul className="text-gray-300 space-y-2">
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Content relevance and logical arguments</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Communication clarity and confidence</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Active listening and engagement</li>
                    <li className="flex gap-3"><span className="text-cyan-400">•</span>Respectful interaction with others</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={startDiscussion}
              className="px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105 shadow-lg mt-8 flex flex-row gap-4"
              style={{
                background: 'linear-gradient(135deg, rgb(13, 148, 136) 0%, rgb(37, 99, 235) 100%)',
                boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Users className="w-6 h-6" />
              Start Group Discussion
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (discussionEnded && feedback && metrics) {
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
            <h1 className="text-3xl md:text-4xl font-bold text-center mt-12 mb-8">Your Discussion Analysis</h1>

            {/* Pentagon Chart */}
            <div className="bg-gradient-to-b from-gray-800 to-black rounded-2xl p-6 md:p-8">
              <h2 className="text-2xl font-bold text-center mb-4">Performance Insights</h2>
              <PentagonChart metrics={metrics} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 -mt-12">
                <div className="bg-blue-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{metrics.rateOfSpeech}</div>
                  <div className="text-sm text-gray-300">Words/Min</div>
                </div>
                <div className="bg-purple-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{metrics.fluencyScore}/10</div>
                  <div className="text-sm text-gray-300">Fluency</div>
                </div>
                <div className="bg-green-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold capitalize">{metrics.confidenceCategory}</div>
                  <div className="text-sm text-gray-300">Confidence</div>
                </div>
                <div className="bg-orange-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{metrics.fillerWordCount}</div>
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
                  {feedback.whatWentWell.map((point, i) => (
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
                  {feedback.areasForImprovement.map((point, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-red-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Key Strengths Section */}
            {feedback.keyStrengths && feedback.keyStrengths.length > 0 && (
              <div className="bg-blue-900/30 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-blue-500/30">
                <h3 className="text-2xl font-bold mb-6">Key Strengths</h3>
                <ul className="space-y-3">
                  {feedback.keyStrengths.map((strength, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-blue-400 font-bold">★</span>
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={resetDiscussion}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
              >
                Start New Discussion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Circular arrangement component
  const CircularDiscussion = () => {
    // 5 positions around the circle circumference
    const positions = [
      { bottom: '82%', left: '50%', transform: 'translateX(-50%)' }, // User
      { top: '35%', right: '22%', transform: 'translateY(-50%)' }, // Top Right
      { bottom: '10%', left: '27%', transform: 'translateX(-50%)' }, // Bottom Left
      { top: '35%', left: '22%', transform: 'translateY(-50%)' }, // Top Left
      { top: '80%', right: '22%', transform: 'translateY(-50%)' }, // Bottom Right
    ];

    const botTypes = ['User', 'Initiator', 'Analyst', 'Mediator', 'Contrarian'] as const;

    return (
      <div className="relative w-full h-[600px] flex items-center justify-center">
        {/* Discussion Circle Background */}
        <div className="absolute inset-0 flex items-center justify-center mt-32">
          <div className="w-96 h-96 rounded-full border-4 border-indigo-200/30 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700 mb-2">Group Discussion</div>
              <div className="text-sm text-gray-500">Topic: {topic}</div>
            </div>
          </div>
        </div>

        {/* Bot Avatars in Circle */}
        {botTypes.map((botType, index) => {
          const isCurrentlySpeaking = 
            (botType === 'User' && isUserSpeaking) || 
            (botType !== 'User' && currentSpeakingBot === botType);
          
          const currentText = botType === 'User' ? "User is speaking..." : 
                            (currentSpeakingBot === botType ? currentBotText : "");

          return (
            <div
              key={botType}
              className="absolute"
              style={positions[index]}
            >
              <div className="relative">
                {/* Bot Avatar */}
                <div className="w-32 h-32">
                  <BotAvatar
                    isSpeaking={isCurrentlySpeaking}
                    currentText={currentText}
                    botType={botType}
                  />
                </div>
                
                {/* Bot Name Label */}
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                  <div className={`px-3 py-1 rounded-full text-xs font-medium text-white ${
                    botType === 'Initiator' ? 'bg-blue-500' :
                    botType === 'Analyst' ? 'bg-purple-500' :
                    botType === 'Contrarian' ? 'bg-orange-500' :
                    botType === 'Mediator' ? 'bg-green-500' :
                    'bg-indigo-500'
                  }`}>
                    {botType}
                  </div>
                </div>

                {/* Speaking Indicator */}
                {isCurrentlySpeaking && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-screen min-h-screen p-4" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
            <h2 className="text-white text-xl md:text-2xl font-bold mb-2">Group Discussion</h2>
            <p className="text-indigo-100 text-sm md:text-base">{topic}</p>
          </div>

          {/* Circular Discussion Area */}
          <div className="bg-gray-50 p-8">
            <CircularDiscussion />
          </div>

          {/* Controls */}
          <div className="bg-gray-50 p-4 border-t">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <Mic className="w-5 h-5" />
                  <span>Hold to Speak</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center space-x-2 animate-pulse"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop Recording</span>
                </button>
              )}

              <button
                onClick={endDiscussionAndGetFeedback}
                disabled={isProcessing || messages.length < 3}
                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Processing...
                  </span>
                ) : (
                  'End Discussion'
                )}
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 mt-3">
              Click the microphone to join the conversation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}