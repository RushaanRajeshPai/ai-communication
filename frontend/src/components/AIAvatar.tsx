import React, { useEffect, useState } from 'react';

interface AIAvatarProps {
    isSpeaking: boolean;
    currentText: string;
}

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
            <div className={`relative w-48 h-48 rounded-full transition-all duration-300`}>
                {/* Face Background */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-600 via-indigo-500 to-violet-600
                    shadow-lg"></div>
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
                <div className="absolute top-12 left-10 w-10 h-2 bg-black rounded-full transform rotate-16"></div>
                <div className="absolute top-12 right-10 w-10 h-2 bg-black rounded-full transform -rotate-16"></div>
                {/* Nose */}
                <div className="absolute top-28 left-1/2 transform -translate-x-1/2 w-3 h-4 bg-black rounded-full opacity-60"></div>
                {/* Mouth - Animated */}
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
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
                <div className="absolute bottom-16 left-6 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>
                <div className="absolute bottom-16 right-6 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>

            </div>

            {/* Speaking indicator */}
            {isSpeaking && (
                <div className="absolute top-60 left-1/2 transform -translate-x-1/2">
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