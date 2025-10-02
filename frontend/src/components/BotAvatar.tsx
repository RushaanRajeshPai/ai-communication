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
            <div className="relative w-32 h-32 flex items-center justify-center">
                <div className={`relative w-24 h-24 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-pulse' : ''}`}>
                    {/* Face Background */}
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-b ${config.gradient} shadow-lg`}></div>
                    
                    {/* Eyes */}
                    <div className="absolute top-8 left-6 w-4 h-4 bg-white rounded-full shadow-md">
                        <div className={`absolute top-1 left-1 w-2 h-2 ${config.eyeColor} rounded-full ${isSpeaking ? 'animate-pulse' : ''}`}></div>
                        <div className="absolute top-1.5 left-1.5 w-0.5 h-0.5 bg-white rounded-full"></div>
                    </div>
                    <div className="absolute top-8 right-6 w-4 h-4 bg-white rounded-full shadow-md">
                        <div className={`absolute top-1 left-1 w-2 h-2 ${config.eyeColor} rounded-full ${isSpeaking ? 'animate-pulse' : ''}`}></div>
                        <div className="absolute top-1.5 left-1.5 w-0.5 h-0.5 bg-white rounded-full"></div>
                    </div>
                    
                    {/* Eyebrows */}
                    <div className={`absolute top-6 left-5 w-5 h-1 ${config.eyebrowColor} rounded-full transform rotate-16`}></div>
                    <div className={`absolute top-6 right-5 w-5 h-1 ${config.eyebrowColor} rounded-full transform -rotate-16`}></div>
                    
                    {/* Nose */}
                    <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-1.5 h-2 bg-black rounded-full opacity-60"></div>
                    
                    {/* Simple mouth for user */}
                    <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 w-6 h-3 bg-red-500 rounded-full"></div>
                    
                    {/* Cheeks */}
                    <div className="absolute bottom-8 left-3 w-3 h-2 bg-pink-200 rounded-full opacity-60"></div>
                    <div className="absolute bottom-8 right-3 w-3 h-2 bg-pink-200 rounded-full opacity-60"></div>
                </div>
            </div>
        );
    }

    // For bot avatars, show full lip sync animation
    return (
        <div className="relative w-32 h-32 flex items-center justify-center">
            <div className={`relative w-24 h-24 rounded-full transition-all duration-300`}>
                {/* Face Background */}
                <div className={`absolute inset-0 rounded-full bg-gradient-to-b ${config.gradient} shadow-lg`}></div>
                
                {/* Eyes */}
                <div className="absolute top-8 left-6 w-4 h-4 bg-white rounded-full shadow-md">
                    <div className={`absolute top-1 left-1 w-2 h-2 ${config.eyeColor} rounded-full`}></div>
                    <div className="absolute top-1.5 left-1.5 w-0.5 h-0.5 bg-white rounded-full"></div>
                </div>
                <div className="absolute top-8 right-6 w-4 h-4 bg-white rounded-full shadow-md">
                    <div className={`absolute top-1 left-1 w-2 h-2 ${config.eyeColor} rounded-full`}></div>
                    <div className="absolute top-1.5 left-1.5 w-0.5 h-0.5 bg-white rounded-full"></div>
                </div>
                
                {/* Eyebrows */}
                <div className={`absolute top-6 left-5 w-5 h-1 ${config.eyebrowColor} rounded-full transform rotate-16`}></div>
                <div className={`absolute top-6 right-5 w-5 h-1 ${config.eyebrowColor} rounded-full transform -rotate-16`}></div>
                
                {/* Nose */}
                <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-1.5 h-2 bg-black rounded-full opacity-60"></div>
                
                {/* Mouth - Animated */}
                <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2">
                    {/* Mouth outline */}
                    <div
                        className="w-6 h-3 bg-red-500 rounded-full transition-all duration-100 ease-in-out"
                        style={{
                            height: `${3 + mouthOpenness * 10}px`,
                            width: `${24 + mouthOpenness * 4}px`
                        }}
                    ></div>

                    {/* Mouth cavity */}
                    <div
                        className="absolute top-0.5 left-0.5 w-5 h-2 bg-black rounded-full transition-all duration-100 ease-in-out"
                        style={{
                            height: `${2 + mouthOpenness * 8}px`,
                            width: `${20 + mouthOpenness * 3}px`
                        }}
                    ></div>

                    {/* Tongue */}
                    {mouthOpenness > 0.4 && (
                        <div
                            className="absolute top-1 left-1 w-4 h-1.5 bg-pink-400 rounded-full transition-all duration-100 ease-in-out"
                            style={{
                                height: `${1.5 + mouthOpenness * 4}px`,
                                width: `${16 + mouthOpenness * 2}px`
                            }}
                        ></div>
                    )}
                </div>

                {/* Cheeks */}
                <div className="absolute bottom-8 left-3 w-3 h-2 bg-pink-200 rounded-full opacity-60"></div>
                <div className="absolute bottom-8 right-3 w-3 h-2 bg-pink-200 rounded-full opacity-60"></div>
            </div>
        </div>
    );
};

export default BotAvatar;