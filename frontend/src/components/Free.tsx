import React, { useState, useEffect, useRef } from 'react';
import { Mic, PhoneOff, CircleHelp, MicOff, X, Check } from 'lucide-react';
import io, { Socket } from 'socket.io-client';
import AIAvatar from './AIAvatar';
import whitelogo from "../assets/whitelogo.png";

interface UserInfo {
    fullname: string;
    age: number;
    gender: string;
    role: string;
}

interface FeedbackData {
    shortFeedback: string;
    detailedFeedback: {
        strengths: string[];
        improvements: string[];
        overallAssessment: string;
    };
}

interface Metrics {
    fluencyScore: number;
    rateOfSpeech: number;
    confidenceCategory: string;
    fillerWordCount: number;
    durationMinutes: number;
}

const Free: React.FC = () => {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [isConversationActive, setIsConversationActive] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [currentText, setCurrentText] = useState('');
    const [showFeedbackAvatar, setShowFeedbackAvatar] = useState(false);
    const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [showDetailedReport, setShowDetailedReport] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisComplete, setAnalysisComplete] = useState(false);
    const [feedbackComplete, setFeedbackComplete] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const recognitionRef = useRef<any>(null);
    const silenceTimerRef = useRef<number | null>(null);
    const conversationIdRef = useRef<string | null>(null);

    const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

    // Initialize conversation
    useEffect(() => {
        const initConversation = async () => {
            try {
                const userId = localStorage.getItem('userId');
                console.log('Initializing conversation for userId:', userId);

                if (!userId) {
                    setError('User not logged in');
                    return;
                }

                const response = await fetch('http://localhost:5000/api/free/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });

                console.log('Initialize response status:', response.status);
                const data = await response.json();
                console.log('Initialize response data:', data);

                if (response.ok) {
                    console.log('Setting conversationId to:', data.conversationId);
                    setConversationId(data.conversationId);
                    conversationIdRef.current = data.conversationId;
                    setUserInfo(data.userInfo);

                    // Initialize WebSocket
                    const socket = io('http://localhost:5000');
                    socketRef.current = socket;

                    socket.emit('join-conversation', data.conversationId);
                    console.log('Joined conversation:', data.conversationId);

                    socket.on('ai-response', handleAIResponse);
                    socket.on('conversation-ended', handleConversationEnded);
                    socket.on('error', (err: any) => {
                        console.error('Socket error:', err);
                        setError(err.message);
                    });
                } else {
                    console.error('Initialize failed:', data);
                    setError(data.message);
                }
            } catch (err: any) {
                console.error('Init error:', err);
                setError('Failed to initialize conversation');
            }
        };

        initConversation();

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
            }
        };
    }, []);

    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            recognition.maxAlternatives = 1;

            let hasReceivedResult = false;
            let finalTranscript = '';

            recognition.onstart = () => {
                console.log('Speech recognition started');
                hasReceivedResult = false;
                finalTranscript = '';
            };

            recognition.onresult = (event: any) => {
                console.log('Speech recognition result received');
                hasReceivedResult = true;

                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                const displayText = finalTranscript || interimTranscript;
                setCurrentText(displayText);

                if (finalTranscript) {
                    console.log('Final transcript received:', finalTranscript);
                    sendMessage(finalTranscript);
                    setCurrentText('');
                } else {
                    console.log('Interim transcript:', interimTranscript);
                    resetSilenceTimer();
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'no-speech' && hasReceivedResult) {
                    console.log('No speech detected after receiving results');
                }
            };

            recognition.onend = () => {
                console.log('Speech recognition ended');
                if (isConversationActive && !isSpeaking) {
                    if (!finalTranscript && hasReceivedResult) {
                        console.log('Sending interim transcript on end');
                        sendMessage(currentText);
                        setCurrentText('');
                    }

                    setTimeout(() => {
                        if (isConversationActive && !isSpeaking) {
                            console.log('Restarting speech recognition');
                            recognition.start();
                        }
                    }, 500);
                }
            };

            recognitionRef.current = recognition;
        } else {
            setError('Speech recognition not supported in this browser');
        }
    }, [isConversationActive, isSpeaking]);

    const resetSilenceTimer = () => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
        }

        console.log('Setting silence timer for 2 seconds');
        silenceTimerRef.current = setTimeout(() => {
            console.log('Silence timer fired. Current text:', currentText);
            if (isListening && currentText.trim()) {
                console.log('Sending message after silence:', currentText);
                sendMessage(currentText);
                setCurrentText('');
            } else if (isConversationActive && !isSpeaking && !currentText.trim()) {
                console.log('Handling silence timeout');
                handleSilence();
            }
        }, 2000);
    };

    const handleSilence = () => {
        if (socketRef.current && conversationId) {
            socketRef.current.emit('silence-timeout', conversationId);
        }
    };

    const sendMessage = (message: string) => {
        console.log('sendMessage called with:', message);
        console.log('Current conversationId (state):', conversationId);
        console.log('Current conversationId (ref):', conversationIdRef.current);
        console.log('Socket exists:', !!socketRef.current);

        const currentConversationId = conversationIdRef.current;

        if (socketRef.current && currentConversationId && message.trim()) {
            console.log('Emitting user-message to socket');
            setIsListening(false);
            socketRef.current.emit('user-message', {
                conversationId: currentConversationId,
                message: message.trim()
            });
        } else {
            console.log('sendMessage failed - socket:', !!socketRef.current, 'conversationId:', currentConversationId, 'message:', message);
        }
    };

    const handleAIResponse = (data: { text: string; conversationId: string; isSilenceWarning?: boolean }) => {
        setIsSpeaking(true);
        setCurrentText(data.text);

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(data.text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            utterance.onend = () => {
                setIsSpeaking(false);
                setCurrentText('');

                if (!data.isSilenceWarning) {
                    setIsListening(true);
                    if (recognitionRef.current) {
                        recognitionRef.current.start();
                    }
                    resetSilenceTimer();
                }
            };

            speechSynthesisRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        } else {
            setIsSpeaking(false);
            setError('Text-to-speech not supported');
        }
    };

    const handleConversationEnded = async () => {
        setIsConversationActive(false);
        setIsListening(false);

        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        setShowFeedbackAvatar(true);
        setAnalysisComplete(false);
        setFeedbackComplete(false);
        setFeedbackData({
            shortFeedback: "Processing your conversation...",
            detailedFeedback: {
                strengths: [],
                improvements: [],
                overallAssessment: "Analyzing your performance..."
            }
        });
        setMetrics({
            fluencyScore: 0,
            rateOfSpeech: 0,
            confidenceCategory: "monotone",
            fillerWordCount: 0,
            durationMinutes: 0
        });

        // Complete analysis after 2 seconds
        setTimeout(() => {
            setAnalysisComplete(true);
        }, 2000);

        try {
            const response = await fetch(`http://localhost:5000/api/free/feedback/${conversationId}`);
            const data = await response.json();

            if (response.ok) {
                setMetrics(data.metrics);
                setFeedbackData(data.feedback);
                setFeedbackComplete(true);

                const feedbackText = data.feedback.shortFeedback;
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(feedbackText);
                    utterance.onend = () => {
                        setIsSpeaking(false);
                    };
                    window.speechSynthesis.speak(utterance);
                    setIsSpeaking(true);
                }
            }
        } catch (err) {
            console.error('Error fetching feedback:', err);
            setError('Failed to fetch feedback');
        }
    };

    const startConversation = () => {
        setIsConversationActive(true);
        setIsListening(true);

        if (recognitionRef.current) {
            recognitionRef.current.start();
        }

        resetSilenceTimer();
    };

    const endConversation = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        handleConversationEnded();
    };

    

    if (error) {
        return (
            <div className="w-screen min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-gray-700">{error}</p>
                </div>
            </div>
        );
    }

    if (showDetailedReport && feedbackData && metrics) {
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
                        <h1 className="text-3xl md:text-4xl font-bold text-center mt-12 mb-8">Your Conversation Analysis</h1>

                        {/* Metrics Cards */}
                        <div className="bg-gradient-to-b from-gray-800 to-black rounded-2xl p-6 md:p-8">
                            <h2 className="text-2xl font-bold text-center mb-8">Performance Metrics</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                    {feedbackData.detailedFeedback.strengths.map((point, i) => (
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
                                    {feedbackData.detailedFeedback.improvements.map((point, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="text-red-400 font-bold">•</span>
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Overall Assessment */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-white/20">
                            <h3 className="text-2xl font-bold mb-4">Overall Assessment</h3>
                            <div className="bg-black/30 rounded-lg p-4">
                                <p className="text-gray-300 leading-relaxed">
                                    {feedbackData.detailedFeedback.overallAssessment}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={() => window.location.href = '/free-topic'}
                                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
                            >
                                Have Another Conversation
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (showFeedbackAvatar && feedbackData && metrics) {
        // Show loading screen if feedback is not complete
        if (!feedbackComplete) {
            return (
                <div className="w-screen min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
                    <div className="bg-gradient-to-b from-gray-800 to-black rounded-xl shadow-2xl p-12 max-w-2xl">
                        <h2 className="text-3xl font-bold text-center text-cyan-400 mb-12">
                            Processing Your Conversation
                        </h2>

                        <div className="space-y-8">
                            {/* Step 1: Analyzing conversation */}
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-8 h-8">
                                    {analysisComplete ? (
                                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                            <svg className="w-5 h-5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                                <path d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-lg font-semibold text-white">Analyzing your conversation</p>
                                </div>
                            </div>

                            {/* Step 2: Generating feedback */}
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-8 h-8">
                                    {feedbackComplete ? (
                                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                            <svg className="w-5 h-5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                                <path d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        </div>
                                    ) : analysisComplete ? (
                                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <div className="w-8 h-8 border-4 border-gray-300 rounded-full"></div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-lg font-semibold ${analysisComplete ? 'text-white' : 'text-gray-400'}`}>
                                        Generating a detailed feedback and report
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Show feedback avatar after processing is complete
        return (
            <div className="w-screen min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
                <AIAvatar
                    isSpeaking={isSpeaking}
                    currentText={feedbackData.shortFeedback}
                />

                <div className="mt-8 text-center">
                    <p className="text-2xl font-bold text-white mb-4">
                        {metrics.fluencyScore >= 5 ? '😊 You have fared well!' : '😔 There is room for improvement, keep practicing!'}
                    </p>
                </div>

                {!isSpeaking && (
                    <button
                        onClick={() => setShowDetailedReport(true)}
                        className="mt-4 text-white px-8 py-3 rounded-lg font-semibold hover:scale-105 transition shadow-lg"
                        style={{
                            background: 'linear-gradient(135deg, rgb(13, 148, 136) 0%, rgb(37, 99, 235) 100%)',
                            boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)'
                          }}
                    >
                        View Full Report
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="w-screen min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
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
            
            {!isConversationActive ? (
                <div className="flex items-center justify-center flex-1 p-4 mt-20">
                    <div className="bg-gradient-to-b from-gray-800 to-black rounded-2xl p-8 px-12 max-w-2xl">
                        <div className="text-center items-center">
                            <h1 className="text-5xl font-bold text-cyan-400 mb-4">
                                Greetings, {userInfo?.fullname || 'there'}!
                            </h1>
                            <p className="text-2xl text-gray-300 mb-8">
                                Wish to have a conversation with me?
                            </p>
                            <div className="space-y-4 w-full">
                                <div className="flex items-start space-x-4">
                                    <CircleHelp className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-xl text-cyan-400">How this would work</h3>
                                    </div>
                                </div>
                                <ul className="text-gray-300 space-y-2 text-lg">
                                    <ul className="text-gray-300 space-y-2 pl-12 text-lg">
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>You can speak to me on any topic of your choice</li>
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>I will respond back to you, like a natural conversation</li>
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>This is a free-flowing speech, no need to submit audio</li>
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>You can end the conversation at any given time</li>
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>You will get an audio feedback on your speaking</li>
                                        <li className="flex gap-3"><span className="text-cyan-400">•</span>You will also get an AI-generated performance report</li>
                                    </ul>
                                </ul>

                                <div className="flex flex-col items-center pt-4">
                                    <button
                                        onClick={startConversation}
                                        className="text-white px-12 py-4 rounded-full font-semibold text-lg hover:scale-105 transition shadow-lg flex items-center gap-3"
                                        style={{
                                            background: 'linear-gradient(135deg, rgb(13, 148, 136) 0%, rgb(37, 99, 235) 100%)',
                                            boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)'
                                        }}
                                    >
                                        <Mic size={24} />
                                        Start the Conversation
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 relative flex items-center justify-center -mt-12">
                    {/* Main AI Avatar in center */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        {/* AI Mute indicator - shows when user is speaking */}
                        {isListening && !isSpeaking && (
                            <div className="absolute top-64 bg-gray-900 bg-opacity-80 rounded-full p-3 z-10">
                                <MicOff className="w-6 h-6 text-red-500" />
                            </div>
                        )}
                        
                        <AIAvatar
                            isSpeaking={isSpeaking}
                            currentText={currentText}
                        />
                    </div>

                    {/* User video box - bottom right corner */}
                    <div className="absolute bottom-28 right-6 w-64 h-48 bg-gray-900 rounded-lg shadow-2xl overflow-hidden border-2 border-gray-700">
                        <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                            {/* User avatar/placeholder */}
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-3xl font-bold">
                                {userInfo?.fullname?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            
                            {/* User name label */}
                            <div className="absolute bottom-3 left-3 bg-gray-900 bg-opacity-70 px-3 py-1 rounded text-white text-sm">
                                {userInfo?.fullname || 'You'}
                            </div>
                            
                            {/* User mute indicator - shows when AI is speaking */}
                            {isSpeaking && (
                                <div className="absolute top-4 right-3 bg-red-600 bg-opacity-90 rounded-full p-2">
                                    <MicOff className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom control bar */}
                    <div className="absolute bottom-2 left-0 right-0 bg-gray-900 bg-opacity-90 py-3 flex items-center justify-center">
                        <button
                            onClick={endConversation}
                            className="bg-red-600 hover:scale-105 text-white p-4 rounded-full transition shadow-lg"
                        >
                            <PhoneOff size={24} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Free;