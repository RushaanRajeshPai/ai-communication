import React, { useState, useEffect, useRef } from 'react';
import { Mic, PhoneOff } from 'lucide-react';
import io, { Socket } from 'socket.io-client';
import AIAvatar from './AIAvatar';

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

  const socketRef = useRef<Socket | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const conversationIdRef = useRef<string | null>(null); // Add this line

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
          conversationIdRef.current = data.conversationId; // Add this line
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
          // Send immediately when we get a final result
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
          // Only handle no-speech if we actually received some results
          console.log('No speech detected after receiving results');
        }
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        if (isConversationActive && !isSpeaking) {
          // If we have a final transcript, it was already sent in onresult
          // Only restart if we don't have a final result
          if (!finalTranscript && hasReceivedResult) {
            console.log('Sending interim transcript on end');
            sendMessage(currentText);
            setCurrentText('');
          }
          
          // Restart recognition
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

    console.log('Setting silence timer for 4 seconds');
    silenceTimerRef.current = setTimeout(() => {
      console.log('Silence timer fired. Current text:', currentText);
      if (isListening && currentText.trim()) {
        // User spoke and there's transcribed text - send it automatically
        console.log('Sending message after silence:', currentText);
        sendMessage(currentText);
        setCurrentText('');
      } else if (isConversationActive && !isSpeaking && !currentText.trim()) {
        // No text detected - handle silence
        console.log('Handling silence timeout');
        handleSilence();
      }
    }, 4000);
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
    
    // Use the ref value which is always current
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
    
    // Use Web Speech API for TTS
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

    try {
      const response = await fetch(`http://localhost:5000/api/free/feedback/${conversationId}`);
      const data = await response.json();
      
      if (response.ok) {
        setMetrics(data.metrics);
        setFeedbackData(data.feedback);
        setShowFeedbackAvatar(true);
        
        // Speak short feedback
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
      <div className="w-screen min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-8">
          <h1 className="text-4xl font-bold text-center mb-8 text-indigo-600">
            Conversation Report
          </h1>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-indigo-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Fluency Score</h3>
              <p className="text-4xl font-bold text-indigo-600">{metrics.fluencyScore}/10</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Confidence</h3>
              <p className="text-2xl font-bold text-indigo-600 capitalize">{metrics.confidenceCategory}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Speaking Rate</h3>
              <p className="text-2xl font-bold text-indigo-600">{metrics.rateOfSpeech} wpm</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Duration</h3>
              <p className="text-2xl font-bold text-indigo-600">{metrics.durationMinutes.toFixed(1)} min</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Strengths</h2>
            <ul className="space-y-2">
              {feedbackData.detailedFeedback.strengths.map((strength, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-gray-700">{strength}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Areas for Improvement</h2>
            <ul className="space-y-2">
              {feedbackData.detailedFeedback.improvements.map((improvement, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-amber-500 mr-2">→</span>
                  <span className="text-gray-700">{improvement}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Overall Assessment</h2>
            <p className="text-gray-700 leading-relaxed">
              {feedbackData.detailedFeedback.overallAssessment}
            </p>
          </div>

          <button
            onClick={() => window.location.href = '/dashboard'}
            className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (showFeedbackAvatar && feedbackData && metrics) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex flex-col items-center justify-center p-4">
        <AIAvatar 
          isSpeaking={isSpeaking}
          currentText={feedbackData.shortFeedback}
        />
        
        <div className="mt-8 text-center">
          <p className="text-2xl font-bold text-gray-800 mb-4">
            {metrics.fluencyScore >= 5 ? '😊 Great Job!' : '😔 Keep Practicing'}
          </p>
          <p className="text-lg text-gray-600 max-w-2xl">
            {feedbackData.shortFeedback}
          </p>
        </div>

        {!isSpeaking && (
          <button
            onClick={() => setShowDetailedReport(true)}
            className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition shadow-lg"
          >
            View Full Report
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      {!isConversationActive ? (
        <div className="text-center items-center">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            Greetings {userInfo?.fullname || 'there'}!
          </h1>
          <p className="text-2xl text-gray-600 mb-8">
            What do you want to talk about?
          </p>

          <button
            onClick={startConversation}
            className="bg-indigo-600 text-white px-12 py-4 rounded-full font-semibold text-lg hover:bg-indigo-700 transition shadow-xl flex items-center gap-3"
          >
            <Mic size={24} />
            Start the Conversation
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <AIAvatar 
            isSpeaking={isSpeaking}
            currentText={currentText}
          />

          <div className="mt-8 text-center">
            {isListening && (
              <div className="flex items-center gap-2 justify-center mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <p className="text-lg text-gray-700 font-semibold">Listening...</p>
              </div>
            )}
            
            {isSpeaking && (
              <p className="text-lg text-indigo-600 font-semibold mb-4">
                AI is speaking...
              </p>
            )}

            {currentText && (
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mb-6">
                <p className="text-gray-700 text-lg">{currentText}</p>
              </div>
            )}
          </div>

          <button
            onClick={endConversation}
            className="mt-8 bg-red-500 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-600 transition shadow-lg flex items-center gap-2"
          >
            <PhoneOff size={20} />
            End Conversation
          </button>
        </div>
      )}
    </div>
  );
};

export default Free;