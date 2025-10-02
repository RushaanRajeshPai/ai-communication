import React, { useEffect, useState } from 'react';

interface AIAvatarProps {
  isSpeaking: boolean;
  currentText: string;
}

// Simple but effective lip sync
const useLipSync = (text: string, isSpeaking: boolean) => {
  const [mouthOpenness, setMouthOpenness] = useState(0);
  
  useEffect(() => {
    if (!isSpeaking || !text) {
      setMouthOpenness(0);
      return;
    }

    const animateLipSync = () => {
      const vowels = /[aeiouAEIOU]/g;
      const vowelCount = (text.match(vowels) || []).length;
      const totalChars = text.length;
      
      if (totalChars === 0) return;
      
      const vowelRatio = vowelCount / totalChars;
      const baseOpenness = vowelRatio * 0.6;
      
      // Add time-based variation for natural movement
      const time = Date.now() * 0.01;
      const variation = Math.sin(time) * 0.3 + Math.sin(time * 1.7) * 0.2;
      
      setMouthOpenness(Math.max(0, Math.min(0.8, baseOpenness + variation)));
    };

    const interval = setInterval(animateLipSync, 100);
    return () => clearInterval(interval);
  }, [text, isSpeaking]);

  return mouthOpenness;
};

const AIAvatar: React.FC<AIAvatarProps> = ({ isSpeaking, currentText }) => {
  const mouthOpenness = useLipSync(currentText, isSpeaking);
  
  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {/* Main Avatar Container */}
      <div className={`relative w-48 h-48 rounded-full transition-all duration-300 ${
        isSpeaking ? 'ring-4 ring-blue-400 ring-opacity-50' : ''
      }`}>
        
        {/* Face Background */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-yellow-200 via-yellow-100 to-yellow-200 shadow-lg"></div>
        
        {/* Hair */}
        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-40 h-20 bg-gradient-to-b from-brown-800 to-brown-900 rounded-full"></div>
        <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-36 h-16 bg-gradient-to-b from-brown-700 to-brown-800 rounded-full"></div>
        
        {/* Eyes */}
        <div className="absolute top-16 left-12 w-8 h-8 bg-white rounded-full shadow-md">
          <div className="absolute top-2 left-2 w-4 h-4 bg-gray-800 rounded-full"></div>
          <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
        </div>
        
        <div className="absolute top-16 right-12 w-8 h-8 bg-white rounded-full shadow-md">
          <div className="absolute top-2 left-2 w-4 h-4 bg-gray-800 rounded-full"></div>
          <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
        </div>
        
        {/* Eyebrows */}
        <div className="absolute top-12 left-10 w-10 h-2 bg-brown-600 rounded-full transform rotate-12"></div>
        <div className="absolute top-12 right-10 w-10 h-2 bg-brown-600 rounded-full transform -rotate-12"></div>
        
        {/* Nose */}
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 w-3 h-4 bg-yellow-300 rounded-full opacity-60"></div>
        
        {/* Mouth - Animated */}
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2">
          {/* Mouth outline */}
          <div 
            className="w-12 h-6 bg-red-500 rounded-full transition-all duration-100 ease-in-out"
            style={{
              height: `${6 + mouthOpenness * 20}px`,
              width: `${48 + mouthOpenness * 8}px`
            }}
          ></div>
          
          {/* Mouth cavity */}
          <div 
            className="absolute top-1 left-1 w-10 h-4 bg-black rounded-full transition-all duration-100 ease-in-out"
            style={{
              height: `${4 + mouthOpenness * 16}px`,
              width: `${40 + mouthOpenness * 6}px`
            }}
          ></div>
          
          {/* Tongue */}
          {mouthOpenness > 0.4 && (
            <div 
              className="absolute top-2 left-2 w-8 h-3 bg-pink-400 rounded-full transition-all duration-100 ease-in-out"
              style={{
                height: `${3 + mouthOpenness * 8}px`,
                width: `${32 + mouthOpenness * 4}px`
              }}
            ></div>
          )}
        </div>
        
        {/* Cheeks */}
        <div className="absolute top-20 left-4 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>
        <div className="absolute top-20 right-4 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>
        
        {/* Speaking glow effect */}
        {isSpeaking && (
          <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-pulse"></div>
        )}
      </div>
      
      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAvatar;