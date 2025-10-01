import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Users, MessageCircle, Loader2, Trophy, TrendingUp } from 'lucide-react';

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
  const [botQueue, setBotQueue] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUserId(userData._id || userData.id);
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

      setMessages(prev => [...prev, {
        speaker: data.botName,
        text: data.text,
        timestamp: data.timestamp,
        isUser: false
      }]);

      setBots(prev => prev.map(b => ({
        ...b,
        speaking: false,
        lastMessage: b.name === botName ? data.text : b.lastMessage
      })));

      if (trigger === 'initiate') {
        setTimeout(() => {
          const nextBot = getNextBot(botName);
          if (nextBot) triggerBotResponse(nextBot);
        }, 2000);
      }
    } catch (err: any) {
      console.error('Bot response error:', err);
      setBots(prev => prev.map(b => ({ ...b, speaking: false })));
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processUserAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setError('Could not access microphone. Please grant permission.');
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

  const getConfidenceColor = (category: string) => {
    switch (category) {
      case 'confident': return 'text-green-600 bg-green-50';
      case 'monotone': return 'text-yellow-600 bg-yellow-50';
      case 'hesitant': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!discussionStarted) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Users className="w-12 h-12 text-indigo-600 mr-3" />
              <h1 className="text-4xl md:text-5xl font-bold text-gray-800">
                AI Group Discussion
              </h1>
            </div>
            <p className="text-gray-600 text-lg">
              Practice your group discussion skills with AI participants
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <MessageCircle className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">How it works</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• You'll be given a topic to discuss with 4 AI bots</li>
                    <li>• Each bot has a unique role and perspective</li>
                    <li>• Use your microphone to jump into the conversation anytime</li>
                    <li>• The discussion is transcribed in real-time</li>
                    <li>• Get detailed AI-powered feedback at the end</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <Trophy className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">Evaluation Criteria</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• Content relevance and logical arguments</li>
                    <li>• Communication clarity and confidence</li>
                    <li>• Active listening and engagement</li>
                    <li>• Respectful interaction with others</li>
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
              className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-8 rounded-xl transition-colors flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl"
            >
              <Users className="w-6 h-6" />
              <span className="text-lg">Start Group Discussion</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (discussionEnded && feedback) {
    return (
      <div className="w-screenmin-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10">
            <div className="text-center mb-8">
              <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
                Discussion Complete!
              </h2>
              <p className="text-gray-600">Here's your performance analysis</p>
            </div>

            {metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-blue-700">{metrics.fluencyScore}/10</div>
                  <div className="text-sm text-blue-600">Fluency Score</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-purple-700">{metrics.rateOfSpeech}</div>
                  <div className="text-sm text-purple-600">WPM</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-green-700">{metrics.durationMinutes.toFixed(1)}</div>
                  <div className="text-sm text-green-600">Minutes</div>
                </div>
                <div className={`p-4 rounded-xl ${getConfidenceColor(metrics.confidenceCategory)}`}>
                  <div className="text-lg font-bold capitalize">{metrics.confidenceCategory}</div>
                  <div className="text-sm">Confidence</div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <h3 className="font-bold text-lg text-green-800 mb-3 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  What Went Well
                </h3>
                <ul className="space-y-2">
                  {feedback.whatWentWell.map((point, i) => (
                    <li key={i} className="text-green-700 flex items-start">
                      <span className="mr-2">✓</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h3 className="font-bold text-lg text-amber-800 mb-3">
                  Areas for Improvement
                </h3>
                <ul className="space-y-2">
                  {feedback.areasForImprovement.map((point, i) => (
                    <li key={i} className="text-amber-700 flex items-start">
                      <span className="mr-2">→</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {feedback.keyStrengths && feedback.keyStrengths.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <h3 className="font-bold text-lg text-blue-800 mb-3">Key Strengths</h3>
                  <ul className="space-y-2">
                    {feedback.keyStrengths.map((strength, i) => (
                      <li key={i} className="text-blue-700 flex items-start">
                        <span className="mr-2">★</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={resetDiscussion}
              className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-8 rounded-xl transition-colors"
            >
              Start New Discussion
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
            <h2 className="text-white text-xl md:text-2xl font-bold mb-2">Group Discussion</h2>
            <p className="text-indigo-100 text-sm md:text-base">{topic}</p>
          </div>

          {/* Participants */}
          <div className="bg-gray-50 p-4 border-b">
            <div className="flex flex-wrap gap-3">
              {bots.map((bot) => (
                <div
                  key={bot.name}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
                    bot.speaking ? 'ring-2 ring-indigo-400 bg-white' : 'bg-white'
                  } transition-all`}
                >
                  <div className={`w-3 h-3 rounded-full ${getBotColor(bot.name)} ${
                    bot.speaking ? 'animate-pulse' : ''
                  }`} />
                  <span className="text-sm font-medium">{bot.name}</span>
                </div>
              ))}
              <div className="flex items-center space-x-2 px-4 py-2 rounded-full bg-white">
                <div className={`w-3 h-3 rounded-full bg-indigo-600 ${
                  isRecording ? 'animate-pulse' : ''
                }`} />
                <span className="text-sm font-medium">You</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="h-96 md:h-[500px] overflow-y-auto p-6 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl ${
                    msg.isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="font-semibold text-sm mb-1">{msg.speaker}</div>
                  <div className="text-sm md:text-base">{msg.text}</div>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-center">
                <div className="flex items-center space-x-2 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
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
              Click the microphone to join the conversation anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}