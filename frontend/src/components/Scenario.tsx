import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, User, LogOut, LayoutDashboard } from 'lucide-react';
import whitelogo from "../assets/whitelogo.png"

interface ScenarioOption {
  name: string;
  path: string;
}

interface UserData {
  fullname: string;
  email: string;
  role: "student" | "work";
  gender: "male" | "female" | "other";
  age: number;
}

const scenarios: ScenarioOption[] = [
  { name: 'Free Topic', path: '/free-topic' },
  { name: 'Group Discussion Simulation', path: '/group-discussion' },
  { name: 'Presentation Practice', path: '/presentation' },
  { name: 'Interview Simulation', path: '/interview' },
  { name: 'Networking Conversation', path: '/networking' },
  { name: 'Storytelling & Personal Expression', path: '/storytelling' }
];

const heroImages = [
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=600&fit=crop'
];

const Scenario: React.FC = () => {
  const [showScenarioDropdown, setShowScenarioDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const scenarioDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const userId = localStorage.getItem('userId');

      if (!userId) {
        window.location.href = '/';
        return;
      }

      // Fetch user data from your backend
      const response = await fetch(`http://localhost:5000/api/users/user/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      localStorage.removeItem('userId');
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setImageOpacity(0);
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
        setImageOpacity(1);
      }, 500);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scenarioDropdownRef.current && !scenarioDropdownRef.current.contains(event.target as Node)) {
        setShowScenarioDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    window.location.href = '/';
  };

  const handleNavigate = (path: string) => {
    window.location.href = path;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(27, 31, 46)' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-screen min-h-screen" style={{ background: 'linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)' }}>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: 'rgba(27, 31, 46, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex-shrink-0">
              <div className="w-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                <img src={whitelogo}
                 alt="" />
              </div>
            </div>

             {/* Liquid Dock Navigation */}
             <div className="hidden md:flex items-center justify-center flex-1 px-8">
              <div className="relative rounded-full px-8 py-3 backdrop-blur-xl" style={{ 
                backgroundColor: 'rgba(40, 45, 65, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
              }}>
                <div className="flex items-center space-x-8 relative">
                  {/* Explore Scenarios */}
                  <div 
                    className="relative" 
                    ref={scenarioDropdownRef}
                    onMouseEnter={() => setHoveredNavItem('scenarios')}
                    onMouseLeave={() => setHoveredNavItem(null)}
                  >
                    <button
                      onClick={() => setShowScenarioDropdown(!showScenarioDropdown)}
                      className="relative text-gray-300 hover:text-cyan-400 transition-all duration-300 flex items-center space-x-1 text-sm font-medium py-2 hover:scale-110 transform bg-transparent hover:border-cyan-400"
                    >
                      <span>Explore Scenarios</span>
                      <ChevronDown className="w-4 h-4" />
                      {hoveredNavItem === 'scenarios' && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></div>
                      )}
                    </button>
                    {showScenarioDropdown && (
                      <div className="absolute top-full mt-4 left-0 backdrop-blur-xl rounded-2xl shadow-2xl py-3 min-w-[280px] animate-in fade-in slide-in-from-top-2 duration-300" style={{ 
                        backgroundColor: 'rgba(30, 35, 50, 0.95)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}>
                        {scenarios.map((scenario, index) => (
                          <button
                            key={index}
                            onClick={() => handleNavigate(scenario.path)}
                            className="w-full text-left px-5 py-2.5 text-gray-300 hover:text-white transition-all duration-200 text-sm bg-transparent hover:border-cyan-400"
                            style={{ 
                              borderLeft: '3px solid transparent'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderLeftColor = 'rgb(103, 232, 249)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderLeftColor = 'transparent'}
                          >
                            {scenario.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* About Us */}
                  <div 
                    className="relative"
                    onMouseEnter={() => setHoveredNavItem('about')}
                    onMouseLeave={() => setHoveredNavItem(null)}
                  >
                    <button
                      onClick={() => scrollToSection('about')}
                      className="relative text-gray-300 hover:text-cyan-400 transition-all duration-300 text-sm font-medium py-2 hover:scale-110 transform bg-transparent hover:border-cyan-400"
                    >
                      About Us
                      {hoveredNavItem === 'about' && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></div>
                      )}
                    </button>
                  </div>

                  {/* Demo */}
                  <div 
                    className="relative"
                    onMouseEnter={() => setHoveredNavItem('demo')}
                    onMouseLeave={() => setHoveredNavItem(null)}
                  >
                    <button
                      onClick={() => scrollToSection('demo')}
                      className="relative text-gray-300 hover:text-cyan-400 transition-all duration-300 text-sm py-2 hover:scale-110 transform bg-transparent hover:border-cyan-400"
                    >
                      Demo
                      {hoveredNavItem === 'demo' && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></div>
                      )}
                    </button>
                  </div>

                  {/* Contact */}
                  <div 
                    className="relative"
                    onMouseEnter={() => setHoveredNavItem('contact')}
                    onMouseLeave={() => setHoveredNavItem(null)}
                  >
                    <button
                      onClick={() => scrollToSection('footer')}
                      className="relative text-gray-300 hover:text-cyan-400 transition-all duration-300 text-sm font-medium py-2 hover:scale-110 transform bg-transparent hover:border-cyan-400"
                    >
                      Contact
                      {hoveredNavItem === 'contact' && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* User Menu */}
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center space-x-3 backdrop-blur-xl rounded-full px-4 py-2.5 transition-all duration-300 hover:shadow-lg"
                style={{
                  backgroundColor: 'rgba(40, 45, 65, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <User className="w-5 h-5 text-cyan-400" />
                <span className="text-white text-sm font-medium hidden sm:block">
                  {userData?.fullname || 'User'}
                </span>
              </button>
              {showUserDropdown && (
                <div className="absolute top-full right-0 mt-3 backdrop-blur-xl rounded-xl shadow-2xl py-2 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200" style={{
                  backgroundColor: 'rgba(30, 35, 50, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <button
                    onClick={() => handleNavigate('/dashboard')}
                    className="w-full text-left px-4 py-2.5 text-gray-300 hover:text-cyan-400 transition-colors text-sm flex items-center space-x-3 hover:border-transparent "
                    style={{ backgroundColor: 'rgba(30, 35, 50, 0.95)' }}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>View Dashboard</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    style={{ backgroundColor: 'rgba(30, 35, 50, 0.95)' }}
                    className="w-full text-left px-4 py-2.5 text-gray-300 hover:text-red-400 transition-colors text-sm flex items-center space-x-3 hover:border-transparent"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>

                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8" id="about">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-6">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight">
                Master Your
                <span className="block bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Communication
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-400 leading-relaxed">
                Elevate your speaking skills with AI-powered scenarios. Practice, improve, and track your progress with real-time feedback and comprehensive analytics.
              </p>
              <button
                onClick={() => scrollToSection('scenarios')}
                className="px-8 py-4 rounded-full font-semibold transition-all transform hover:scale-105 hover:shadow-2xl text-white"
                style={{
                  background: 'linear-gradient(135deg, rgb(103, 232, 249) 0%, rgb(45, 152, 218) 100%)',
                  boxShadow: '0 10px 30px rgba(103, 232, 249, 0.3)'
                }}
              >
                Get Started
              </button>
            </div>

            {/* Right Image */}
            <div className="relative h-96 rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={heroImages[currentImageIndex]}
                alt="Hero"
                className="w-full h-full object-cover transition-opacity duration-500"
                style={{ opacity: imageOpacity }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(27, 31, 46, 0.5) 100%)' }}></div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do Section with Journey Roadmap */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-center text-white mb-20">
            What do we do?
          </h1>

          {/* Journey Roadmap */}
          <div className="relative max-w-6xl mx-auto">
            {/* Curved Dotted Road Path */}
            <svg className="absolute inset-0 w-full h-full hidden lg:block" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style={{ stopColor: 'rgb(103, 232, 249)', stopOpacity: 0.8 }} />
                  <stop offset="50%" style={{ stopColor: 'rgb(45, 152, 218)', stopOpacity: 0.8 }} />
                  <stop offset="100%" style={{ stopColor: 'rgb(103, 232, 249)', stopOpacity: 0.8 }} />
                </linearGradient>
              </defs>
              <path
                d="M 150 150 Q 300 100, 450 150 T 850 150 M 850 150 Q 700 200, 550 250 T 150 450"
                stroke="url(#roadGradient)"
                strokeWidth="3"
                fill="none"
                strokeDasharray="8,12"
                strokeLinecap="round"
              />
            </svg>

            {/* Journey Nodes */}
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-16">
              {[
                {
                  title: 'Choose a Scenario',
                  desc: 'Select from various real-world communication scenarios tailored to your needs',
                  gradient: 'from-cyan-400 to-blue-500'
                },
                {
                  title: 'Conversate with AI',
                  desc: 'Practice with our intelligent AI simulator in realistic conversations',
                  gradient: 'from-blue-400 to-indigo-500'
                },
                {
                  title: 'Get Feedback',
                  desc: 'Receive valuable insights, analytics, and personalized recommendations',
                  gradient: 'from-indigo-400 to-purple-500'
                },
                {
                  title: 'Track Progress',
                  desc: 'Monitor your growth and improvement over time on your personal dashboard',
                  gradient: 'from-purple-400 to-pink-500'
                }
              ].map((node, index) => (
                <div
                  key={index}
                  className="relative backdrop-blur-xl rounded-3xl p-8 transition-all duration-300 hover:scale-105 group"
                  style={{
                    backgroundColor: 'rgba(40, 45, 65, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="flex items-start space-x-6">
                    <div className={`flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg bg-gradient-to-br ${node.gradient}`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-white mb-3">{node.title}</h3>
                      <p className="text-gray-400 leading-relaxed">{node.desc}</p>
                    </div>
                  </div>

                  {/* Decorative corner accent */}
                  <div className="absolute top-0 right-0 w-20 h-20 opacity-20 group-hover:opacity-40 transition-opacity">
                    <div className={`w-full h-full rounded-bl-full bg-gradient-to-br ${node.gradient}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Scenarios Section */}
      <section id="scenarios" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-center text-white mb-16">
            Scenarios we Provide
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {scenarios.map((scenario, index) => (
              <div
                key={index}
                onClick={() => handleNavigate(scenario.path)}
                className="group backdrop-blur-xl rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 cursor-pointer"
                style={{
                  backgroundColor: 'rgba(40, 45, 65, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                }}
              >
                <div className="aspect-video flex items-center justify-center" style={{
                  background: 'linear-gradient(135deg, rgba(103, 232, 249, 0.2) 0%, rgba(45, 152, 218, 0.2) 100%)'
                }}>
                  <span className="text-gray-500 text-sm">Scenario Preview</span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {scenario.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


    </div>
  );
};

export default Scenario;