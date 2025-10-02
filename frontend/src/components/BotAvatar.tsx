import React, { useEffect, useState } from 'react';

interface BotAvatarProps {
    isSpeaking: boolean;
    currentText: string;
    botType: 'Initiator' | 'Analyst' | 'Contrarian' | 'Mediator' | 'User';
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

const getAvatarConfig = (botType: string) => {
    const configs = {
        'Initiator': {
            gradient: 'from-blue-600 via-blue-500 to-blue-600',
            eyeColor: 'bg-blue-800',
            eyebrowColor: 'bg-blue-900',
            indicatorColor: 'bg-blue-600',
            name: 'Initiator'
        },
        'Analyst': {
            gradient: 'from-purple-600 via-purple-500 to-purple-600',
            eyeColor: 'bg-purple-800',
            eyebrowColor: 'bg-purple-900',
            indicatorColor: 'bg-purple-600',
            name: 'Analyst'
        },
        'Contrarian': {
            gradient: 'from-orange-600 via-orange-500 to-orange-600',
            eyeColor: 'bg-orange-800',
            eyebrowColor: 'bg-orange-900',
            indicatorColor: 'bg-orange-600',
            name: 'Contrarian'
        },
        'Mediator': {
            gradient: 'from-green-600 via-green-500 to-green-600',
            eyeColor: 'bg-green-800',
            eyebrowColor: 'bg-green-900',
            indicatorColor: 'bg-green-600',
            name: 'Mediator'
        },
        'User': {
            gradient: 'from-indigo-600 via-indigo-500 to-indigo-600',
            eyeColor: 'bg-indigo-800',
            eyebrowColor: 'bg-indigo-900',
            indicatorColor: 'bg-indigo-600',
            name: 'You'
        }
    };
    return configs[botType as keyof typeof configs] || configs['Initiator'];
};

const BotAvatar: React.FC<BotAvatarProps> = ({ isSpeaking, currentText, botType }) => {
    const mouthOpenness = useLipSync(currentText, isSpeaking);
    const config = getAvatarConfig(botType);

    // For User avatar, show a simpler blinking effect instead of lip sync
    if (botType === 'User') {
        return (
            <div className="relative w-64 h-64 flex items-center justify-center">
                <div className={`relative w-48 h-48 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-pulse' : ''}`}>
                    {/* Face Background */}
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-b ${config.gradient} shadow-lg`}></div>
                    
                    {/* Eyes */}
                    <div className="absolute top-16 left-12 w-8 h-8 bg-white rounded-full shadow-md">
                        <div className={`absolute top-2 left-2 w-4 h-4 ${config.eyeColor} rounded-full ${isSpeaking ? 'animate-pulse' : ''}`}></div>
                        <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
                    </div>
                    <div className="absolute top-16 right-12 w-8 h-8 bg-white rounded-full shadow-md">
                        <div className={`absolute top-2 left-2 w-4 h-4 ${config.eyeColor} rounded-full ${isSpeaking ? 'animate-pulse' : ''}`}></div>
                        <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
                    </div>
                    
                    {/* Eyebrows */}
                    <div className={`absolute top-12 left-10 w-10 h-2 ${config.eyebrowColor} rounded-full transform rotate-16`}></div>
                    <div className={`absolute top-12 right-10 w-10 h-2 ${config.eyebrowColor} rounded-full transform -rotate-16`}></div>
                    
                    {/* Nose */}
                    <div className="absolute top-28 left-1/2 transform -translate-x-1/2 w-3 h-4 bg-black rounded-full opacity-60"></div>
                    
                    {/* Simple mouth for user */}
                    <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-12 h-6 bg-red-500 rounded-full"></div>
                    
                    {/* Cheeks */}
                    <div className="absolute bottom-16 left-6 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>
                    <div className="absolute bottom-16 right-6 w-6 h-4 bg-pink-200 rounded-full opacity-60"></div>
                </div>

                {/* Speaking indicator */}
                {isSpeaking && (
                    <div className="absolute top-60 left-1/2 transform -translate-x-1/2">
                        <div className="flex space-x-2">
                            <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "0ms" }}></div>
                            <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "150ms" }}></div>
                            <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "300ms" }}></div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // For bot avatars, show full lip sync animation
    return (
        <div className="relative w-64 h-64 flex items-center justify-center">
            <div className={`relative w-48 h-48 rounded-full transition-all duration-300`}>
                {/* Face Background */}
                <div className={`absolute inset-0 rounded-full bg-gradient-to-b ${config.gradient} shadow-lg`}></div>
                
                {/* Eyes */}
                <div className="absolute top-16 left-12 w-8 h-8 bg-white rounded-full shadow-md">
                    <div className={`absolute top-2 left-2 w-4 h-4 ${config.eyeColor} rounded-full`}></div>
                    <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
                </div>
                <div className="absolute top-16 right-12 w-8 h-8 bg-white rounded-full shadow-md">
                    <div className={`absolute top-2 left-2 w-4 h-4 ${config.eyeColor} rounded-full`}></div>
                    <div className="absolute top-3 left-3 w-1 h-1 bg-white rounded-full"></div>
                </div>
                
                {/* Eyebrows */}
                <div className={`absolute top-12 left-10 w-10 h-2 ${config.eyebrowColor} rounded-full transform rotate-16`}></div>
                <div className={`absolute top-12 right-10 w-10 h-2 ${config.eyebrowColor} rounded-full transform -rotate-16`}></div>
                
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
                        <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "0ms" }}></div>
                        <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "150ms" }}></div>
                        <div className={`w-3 h-3 ${config.indicatorColor} rounded-full animate-bounce`} style={{ animationDelay: "300ms" }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BotAvatar;