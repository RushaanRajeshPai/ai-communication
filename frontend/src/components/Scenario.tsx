import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, User, LogOut, LayoutDashboard } from 'lucide-react';
import whitelogo from "../assets/whitelogo.png"
import bgImg from '../assets/bgImg.png'

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

const Scenario: React.FC = () => {
  const [showScenarioDropdown, setShowScenarioDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const animatedWords = ['Presence', 'Skills', 'Vision', 'Future'];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animationStage, setAnimationStage] = useState('entering');

  const staggerClasses = ['lg:top-0', 'lg:top-40', 'lg:top-24', 'lg:top-64'];

  useEffect(() => {
    let intervalId: number;
    let timer1: number;
    let timer2: number;

    intervalId = setInterval(() => {
      setAnimationStage('exiting');

      timer1 = setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % animatedWords.length);
        setAnimationStage('entering');
      }, 500);

      timer2 = setTimeout(() => {
        setAnimationStage('active');
      }, 550);

    }, 2000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [animatedWords.length]);

  const getAnimationClasses = () => {
    switch (animationStage) {
      case 'entering':
        return 'opacity-0 translate-y-4';
      case 'active':
        return 'opacity-100 translate-y-0';
      case 'exiting':
        return 'opacity-0 translate-y-4';
      default:
        return 'opacity-100 translate-y-0';
    }
  };

  const scenarioDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  // compute curved path between cards 1→2→3→4
  const roadmapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pathD, setPathD] = useState('');
  const [svgSize, setSvgSize] = useState({ w: 1000, h: 700 });

  useEffect(() => {
    const computePath = () => {
      const container = roadmapRef.current;
      const cards = cardRefs.current;
      if (!container || cards.length < 4 || cards.some(c => !c)) return;

      const crect = container.getBoundingClientRect();
      const rel = (r: DOMRect) => ({
        left: r.left - crect.left,
        top: r.top - crect.top,
        right: r.right - crect.left,
        bottom: r.bottom - crect.top,
        width: r.width,
        height: r.height
      });

      const [r1, r2, r3, r4] = cards.map(c => rel(c!.getBoundingClientRect()));

      const p1_out = { x: r1.right, y: r1.top + r1.height * 0.5 };
      const p2_in = { x: r2.left + r2.width * 0.5, y: r2.top };

      const p2_out = { x: r2.left, y: r2.top + r2.height * 0.5 };
      const p3_in = { x: r3.left + r3.width * 0.5, y: r3.top };

      const p3_out = { x: r3.right, y: r3.top + r3.height * 0.5 };
      const p4_in = { x: r4.left, y: r4.top + r4.height * 0.5 };

      const curve1 = `M ${p1_out.x} ${p1_out.y} C ${p1_out.x + 100} ${p1_out.y - 40}, ${p2_in.x + 40} ${p2_in.y - 80}, ${p2_in.x} ${p2_in.y}`;
      const curve2 = `M ${p2_out.x} ${p2_out.y} C ${p2_out.x - 100} ${p2_out.y + 40}, ${p3_in.x - 40} ${p3_in.y - 80}, ${p3_in.x} ${p3_in.y}`;
      const curve3 = `M ${p3_out.x} ${p3_out.y} C ${p3_out.x + 80} ${p3_out.y}, ${p4_in.x - 80} ${p4_in.y}, ${p4_in.x} ${p4_in.y}`;

      setPathD(`${curve1} ${curve2} ${curve3}`);
      setSvgSize({ w: crect.width, h: crect.height });
    };

    const timeoutId = setTimeout(computePath, 100);

    const onResize = () => {
      setTimeout(computePath, 50);
    };

    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(() => {
      setTimeout(computePath, 50);
    });

    if (roadmapRef.current) ro.observe(roadmapRef.current);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, []);

  const fetchUserData = async () => {
    try {
      const userId = localStorage.getItem('userId');

      if (!userId) {
        window.location.href = '/';
        return;
      }

      //Fetch user data from your backend
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
      <br />
      <br />
      <br />
      <div className="relative z-10">
        {/* Navbar */}
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ backgroundColor: 'rgba(27, 31, 46, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex-shrink-0">
                <div className="w-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                  <img src={whitelogo}
                    alt="" />
                </div>
              </div>

              <div className="hidden md:flex items-center justify-center flex-1 px-8">
                <div className="relative rounded-full px-8 py-3 backdrop-blur-xl" style={{
                  backgroundColor: 'rgba(40, 45, 65, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                }}>
                  <div className="flex items-center space-x-8 relative">
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
        <section className="relative overflow-hidden pt-32 pb-20 px-4 sm:px-6 lg:px-8" id="about">
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${bgImg})`,
              backgroundSize: 'cover',
              backgroundPosition: '50% 10%',
              backgroundRepeat: 'no-repeat'
            }}
          >
            {/* Dark overlay gradient */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, rgba(27, 31, 46, 0.95) 0%, rgba(20, 24, 38, 0.92) 50%, rgba(15, 18, 30, 0.95) 100%)'
              }}
            ></div>
          </div>
          <div className='relative z-10 top-16'>
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Left Content */}
                <div className="space-y-6">
                  <h1 className="text-3xl sm:text-6xl lg:text-6xl font-bold text-white leading-tight">
                    Master Your {' '}
                    <span
                      key={currentIndex}
                      className={`
                      block bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent
                      transition-all duration-500 ease-out transform
                      ${getAnimationClasses()}
                      `}
                      style={{ display: 'inline-block' }}
                    >
                      {animatedWords[currentIndex]}
                    </span>
                  </h1>
                  <p className="text-md sm:text-xl text-gray-400 leading-relaxed">
                    Elevate your speaking skills with AI-powered scenarios. Practice, improve, and track your progress with real-time feedback and comprehensive analytics.
                  </p>
                  <button
                    onClick={() => { console.log('Scroll to scenarios'); /* define your scrollToSection function */ }}
                    className="px-8 py-4 rounded-full font-semibold transition-all transform hover:scale-105 hover:shadow-2xl text-white"
                    style={{
                      background: 'linear-gradient(135deg, rgb(103, 232, 249) 0%, rgb(45, 152, 218) 100%)',
                      boxShadow: '0 10px 30px rgba(103, 232, 249, 0.3)'
                    }}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
          </div>
        </section>

        {/* What We Do Section */}
        <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 mb-60">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-center text-white mb-20">
              What do we do?
            </h1>

            <div className="relative max-w-6xl mx-auto pb-64 lg:pb-[26rem]" ref={roadmapRef}>
              <svg
                className="absolute inset-0 w-full h-full hidden lg:block pointer-events-none"
                viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: 'rgb(103, 232, 249)', stopOpacity: 0.9 }} />
                    <stop offset="50%" style={{ stopColor: 'rgb(45, 152, 218)', stopOpacity: 0.9 }} />
                    <stop offset="100%" style={{ stopColor: 'rgb(103, 232, 249)', stopOpacity: 0.9 }} />
                  </linearGradient>
                </defs>
                <path
                  d={pathD}
                  stroke="url(#roadGradient)"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray="10,15"
                  strokeLinecap="round"
                />
              </svg>

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
                    ref={(el) => {
                      cardRefs.current[index] = el;
                    }}
                    className={`relative backdrop-blur-xl rounded-3xl p-8 transition-all duration-300 hover:scale-105 group overflow-hidden ${staggerClasses[index]}`}
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

    </div>
  );
};

export default Scenario;