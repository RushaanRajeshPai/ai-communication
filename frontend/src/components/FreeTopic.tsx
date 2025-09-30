import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Check, Loader2 } from 'lucide-react';

interface Metrics {
  rateOfSpeech: number;
  fluencyScore: number;
  confidenceCategory: 'monotone' | 'confident' | 'hesitant';
  fillerWordCount: number;
  durationMinutes: number;
}

interface SentenceImprovement {
  original: string;
  improved: string;
}

interface FeedbackData {
  confidenceCategory: string;
  whatWentWell: string[];
  areasForImprovement: string[];
  sentenceImprovements: SentenceImprovement[];
}

interface FeedbackResponse {
  transcription: string;
  metrics: Metrics;
  feedback: FeedbackData;
}

const FreeTopic = () => {
  const [stage, setStage] = useState<'initial' | 'recording' | 'processing' | 'feedback'>('initial');
  const [topic, setTopic] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [feedbackData, setFeedbackData] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Animated threads background
  const ThreadsBackground = () => {
    return (
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"
            style={{
              top: `${(i * 100) / 40}%`,
              left: '-100%',
              width: '200%',
              animation: `slideRight ${10 + Math.random() * 10}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes slideRight {
            from { transform: translateX(0); }
            to { transform: translateX(50%); }
          }
        `}</style>
      </div>
    );
  };

  const fetchTopic = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/freetopic/topic');
      const data = await response.json();
      setTopic(data.topic);
      setStage('recording');
    } catch (err) {
      setError('Failed to fetch topic. Please try again.');
    }
  };

  const mimeTypeRef = useRef<string>('audio/webm'); // add near other refs

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferred =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
          MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
            '';

      mimeTypeRef.current = preferred || 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      setTimeLeft(120);

      timerIntervalRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError('Failed to access microphone. Please grant permission.');
    }
  };

  const stopRecording = (): Promise<void> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (rec && isRecording) {
        const onStop = () => {
          rec.removeEventListener('stop', onStop);
          setIsRecording(false);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          rec.stream.getTracks().forEach(t => t.stop());
          resolve();
        };
        rec.addEventListener('stop', onStop);
        rec.stop();
      } else {
        resolve();
      }
    });
  };

  const submitRecording = async () => {
    await stopRecording();
    setStage('processing');

    const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
    if (!audioBlob || audioBlob.size < 8000) { // ~8KB guard matches backend
      setError('No audio captured. Please try recording again.');
      setStage('recording');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      const durationSeconds = (Date.now() - recordingStartTime) / 1000;

      try {
        const userId = localStorage.getItem('userId');
        const response = await fetch('http://localhost:5000/api/freetopic/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, audioFile: base64Audio, durationSeconds }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data?.message || 'Failed to process recording.');
          setStage('recording');
          return;
        }

        setFeedbackData(data);
        setStage('feedback');
      } catch {
        setError('Failed to process recording. Please try again.');
        setStage('recording');
      }
    };
    reader.readAsDataURL(audioBlob);
  };

  const PentagonChart = ({ metrics }: { metrics: Metrics }) => {
    const confidenceScore = metrics.confidenceCategory === 'confident' ? 8 : metrics.confidenceCategory === 'monotone' ? 5 : 3;
    const fillerScore = Math.max(0, 10 - metrics.fillerWordCount);
    const rateScore = Math.min(10, Math.max(0, (metrics.rateOfSpeech / 150) * 10));

    const points = [
      { label: 'Confidence', value: confidenceScore },
      { label: 'Speech Rate', value: rateScore },
      { label: 'Fluency', value: metrics.fluencyScore },
      { label: 'Filler Words', value: fillerScore },
      { label: 'Duration', value: Math.min(10, metrics.durationMinutes * 5) },
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

    const pathData = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    const maxPathData = maxPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ 
          background: 'radial-gradient(circle, rgba(30, 58, 138, 0.4) 0%, rgba(15, 23, 42, 0.2) 70%)',
          borderRadius: '20px',
          padding: '40px'
        }}>
          <svg width={size} height={size} className="mb-4">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            
            {/* Outer pentagon frame */}
            <path d={maxPathData} fill="none" stroke="rgba(71, 85, 105, 0.5)" strokeWidth="2" />
            
            {/* Grid lines from center */}
            {maxPoints.map((point, i) => (
              <line 
                key={i} 
                x1={center} 
                y1={center} 
                x2={point.x} 
                y2={point.y} 
                stroke="rgba(71, 85, 105, 0.3)" 
                strokeWidth="1" 
              />
            ))}
            
            {/* Inner grid rings */}
            {[0.33, 0.66].map((scale, idx) => {
              const ringPoints = points.map((_, i) => calculatePoint(i, 10 * scale));
              const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
              return (
                <path 
                  key={idx} 
                  d={ringPath} 
                  fill="none" 
                  stroke="rgba(71, 85, 105, 0.2)" 
                  strokeWidth="1" 
                />
              );
            })}
            
            {/* Data area with glow */}
            <path 
              d={pathData} 
              fill="url(#blueGradient)" 
              fillOpacity="0.3" 
              stroke="#3b82f6" 
              strokeWidth="2.5"
              filter="url(#glow)"
            />
            
            {/* Data points */}
            {dataPoints.map((point, i) => (
              <g key={i}>
                <circle cx={point.x} cy={point.y} r="6" fill="#1e3a8a" opacity="0.5" />
                <circle cx={point.x} cy={point.y} r="4" fill="#60a5fa" filter="url(#glow)" />
              </g>
            ))}
            
            {/* Labels */}
            {maxPoints.map((point, i) => {
              const angle = angleStep * i - Math.PI / 2;
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              const labelR = radius + 35;
              const labelX = center + labelR * cos;
              const labelY = center + labelR * sin;
              
              // Special adjustments
              const adjustedX = i === 1 ? labelX + 12 : labelX;
              const adjustedY = i === 0 ? labelY + 8 : labelY; // Move Confidence down
              const anchor = 'middle';

              return (
                <text
                  key={i}
                  x={adjustedX}
                  y={adjustedY}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="text-base font-medium"
                  fill="#cbd5e1"
                  style={{ letterSpacing: '0.5px' }}
                >
                  {points[i].label}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white relative overflow-hidden">
      <ThreadsBackground />

      <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
        {stage === 'initial' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Master Your Voice with Free Speech
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-12 max-w-2xl">
              Practice speaking on random topics and receive AI-powered feedback to improve your communication skills
            </p>
            <button
              onClick={fetchTopic}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105 shadow-lg"
            >
              Ask for a Topic to Speak Upon
            </button>
          </div>
        )}

        {stage === 'recording' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-12 max-w-3xl w-full shadow-2xl border border-white/20">
              <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">Your Topic</h2>
              <div className="bg-blue-600/20 border-2 border-blue-400 rounded-xl p-6 mb-8">
                <p className="text-xl md:text-2xl text-center font-medium">{topic}</p>
              </div>

              {!isRecording && (
                <div className="flex justify-center">
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
                  >
                    <Mic size={24} />
                    Start Recording
                  </button>
                </div>
              )}

              {isRecording && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-5xl font-bold mb-2">{formatTime(timeLeft)}</div>
                    <div className="text-gray-300">Time Remaining</div>
                  </div>

                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all duration-1000"
                      style={{ width: `${((120 - timeLeft) / 120) * 100}%` }}
                    />
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-all"
                    >
                      <Square size={20} />
                      Stop
                    </button>
                    <button
                      onClick={submitRecording}
                      className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-all"
                    >
                      <Check size={20} />
                      Submit
                    </button>
                  </div>

                  <div className="flex justify-center">
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
                </div>
              )}
            </div>
          </div>
        )}

        {stage === 'processing' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <Loader2 className="w-16 h-16 animate-spin mb-4" />
            <p className="text-xl">Processing your speech...</p>
          </div>
        )}

        {stage === 'feedback' && feedbackData && (
          <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-center mb-8">Your Speech Analysis</h1>

            {/* Insights Pentagon Chart */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-white/20">
              <h2 className="text-2xl font-bold mb-6 text-center">Performance Insights</h2>
              <PentagonChart metrics={feedbackData.metrics} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="bg-blue-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{feedbackData.metrics.rateOfSpeech}</div>
                  <div className="text-sm text-gray-300">Words/Min</div>
                </div>
                <div className="bg-purple-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{feedbackData.metrics.fluencyScore}/10</div>
                  <div className="text-sm text-gray-300">Fluency</div>
                </div>
                <div className="bg-green-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold capitalize">{feedbackData.metrics.confidenceCategory}</div>
                  <div className="text-sm text-gray-300">Confidence</div>
                </div>
                <div className="bg-orange-600/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{feedbackData.metrics.fillerWordCount}</div>
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
                  {feedbackData.feedback.whatWentWell.map((point, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-green-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-orange-900/30 backdrop-blur-lg rounded-2xl p-6 border border-orange-500/30">
                <h3 className="text-xl font-bold mb-4">Areas for Improvement</h3>
                <ul className="space-y-3">
                  {feedbackData.feedback.areasForImprovement.map((point, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-orange-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Sentence Improvements */}
            {feedbackData.feedback.sentenceImprovements.length > 0 && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-white/20">
                <h3 className="text-2xl font-bold mb-6">Sentence Enhancements</h3>
                <div className="space-y-6">
                  {feedbackData.feedback.sentenceImprovements.map((item, i) => (
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
                <p className="text-gray-300 leading-relaxed">{feedbackData.transcription}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => {
                  setStage('initial');
                  setTopic('');
                  setFeedbackData(null);
                  setTimeLeft(120);
                }}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
              >
                Practice Again
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeTopic;