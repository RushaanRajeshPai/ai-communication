import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock, MessageSquare, Zap, Target } from 'lucide-react';

interface Recording {
  recordingNumber: number;
  scenario: string;
  confidenceCategory: string;
  rateOfSpeech: number;
  fluencyScore: number;
  fillerWordCount: number;
  createdAt?: Date;
}

interface DashboardData {
  fullname: string;
  email: string;
  gender: string;
  age: number;
  role: string;
  overall: {
    totalDuration: number;
    avgConfidence?: string;
    avgRateOfSpeech: number;
    avgFluencyScore: number;
    totalFillerWords: number;
  };
  totalRecordings: number;
  recordingTrends: Recording[];
}

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        console.error('No userId found in localStorage');
        setLoading(false);
        return;
      }

      const response = await fetch(`http://localhost:5000/api/dashboard/${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const data = await response.json();
      setDashboardData(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const getAvatarImage = (gender: string) => {
    if (gender === 'male') {
      return 'https://api.dicebear.com/7.x/avataaars/svg?seed=male&backgroundColor=b6e3f4';
    } else if (gender === 'female') {
      return 'https://api.dicebear.com/7.x/avataaars/svg?seed=female&backgroundColor=ffdfbf&hair=variant01,variant02';
    } else {
      return 'https://api.dicebear.com/7.x/avataaars/svg?seed=neutral&backgroundColor=d1d4f9';
    }
  };

  if (loading) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-indigo-600 font-semibold">Loading...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-red-600 font-semibold">Error loading dashboard</div>
      </div>
    );
  }

  const { fullname, gender, age, role, overall, recordingTrends } = dashboardData;

  // Prepare data for bar chart
  const overallBarData = [
    {
      name: 'Rate of Speech',
      value: overall.avgRateOfSpeech,
      color: '#3b82f6'
    },
    {
      name: 'Fluency Score',
      value: overall.avgFluencyScore,
      color: '#10b981'
    },
    {
      name: 'Filler Words',
      value: overall.totalFillerWords,
      color: '#f59e0b'
    },
    {
      name: 'Confidence',
      value: overall.avgConfidence === 'confident' ? 100 : overall.avgConfidence === 'hesitant' ? 50 : 75,
      color: '#8b5cf6'
    }
  ];

  // Custom tooltip for bar chart
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-800">{payload[0].payload.name}</p>
          <p className="text-indigo-600 font-bold">{payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for line charts
  const CustomLineTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-700">Recording #{label}</p>
          <p className="text-indigo-600 font-bold">{payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Profile Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex flex-col items-center">
            {/* Avatar */}
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-indigo-500 mb-4 shadow-lg">
              <img 
                src={getAvatarImage(gender)} 
                alt="User Avatar" 
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Name */}
            <h1 className="text-3xl font-bold text-gray-800 mb-4">{fullname}</h1>
            
            {/* User Info */}
            <div className="flex gap-8 mb-6">
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-1">Age</p>
                <p className="text-xl font-semibold text-indigo-600">{age}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-1">Gender</p>
                <p className="text-xl font-semibold text-indigo-600 capitalize">{gender}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-1">Role</p>
                <p className="text-xl font-semibold text-indigo-600 capitalize">
                  {role === 'work' ? 'Working Professional' : 'Student'}
                </p>
              </div>
            </div>
            
            {/* Check Overall Stats Button */}
            <button
              onClick={() => setShowStats(!showStats)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {showStats ? 'Hide Overall Stats' : 'Check Overall Stats'}
            </button>
          </div>
        </div>

        {/* Stats Section */}
        {showStats && (
          <div className="space-y-8">
            {/* Overall Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-600 font-medium">Total Duration</h3>
                  <Clock className="text-blue-500" size={24} />
                </div>
                <p className="text-3xl font-bold text-gray-800">{overall.totalDuration.toFixed(1)}</p>
                <p className="text-sm text-gray-500 mt-1">minutes</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-600 font-medium">Confidence</h3>
                  <TrendingUp className="text-purple-500" size={24} />
                </div>
                <p className="text-3xl font-bold text-gray-800 capitalize">{overall.avgConfidence || 'N/A'}</p>
                <p className="text-sm text-gray-500 mt-1">category</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-600 font-medium">Rate of Speech</h3>
                  <Zap className="text-blue-500" size={24} />
                </div>
                <p className="text-3xl font-bold text-gray-800">{overall.avgRateOfSpeech.toFixed(1)}</p>
                <p className="text-sm text-gray-500 mt-1">words/min</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-600 font-medium">Fluency Score</h3>
                  <Target className="text-green-500" size={24} />
                </div>
                <p className="text-3xl font-bold text-gray-800">{overall.avgFluencyScore.toFixed(1)}</p>
                <p className="text-sm text-gray-500 mt-1">out of 100</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-600 font-medium">Filler Words</h3>
                  <MessageSquare className="text-orange-500" size={24} />
                </div>
                <p className="text-3xl font-bold text-gray-800">{overall.totalFillerWords}</p>
                <p className="text-sm text-gray-500 mt-1">total count</p>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Overall Performance Overview</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overallBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Line Charts - Recording Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rate of Speech Trend */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Rate of Speech Trend</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={recordingTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="recordingNumber" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip content={<CustomLineTooltip />} />
                    <Line type="monotone" dataKey="rateOfSpeech" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Fluency Score Trend */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Fluency Score Trend</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={recordingTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="recordingNumber" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip content={<CustomLineTooltip />} />
                    <Line type="monotone" dataKey="fluencyScore" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Filler Words Trend */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Filler Words Trend</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={recordingTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="recordingNumber" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip content={<CustomLineTooltip />} />
                    <Line type="monotone" dataKey="fillerWordCount" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Confidence Category Distribution */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Confidence Distribution</h3>
                <div className="space-y-4 mt-6">
                  {['confident', 'monotone', 'hesitant'].map((category) => {
                    const count = recordingTrends.filter(r => r.confidenceCategory === category).length;
                    const percentage = recordingTrends.length > 0 ? (count / recordingTrends.length) * 100 : 0;
                    return (
                      <div key={category}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 capitalize">{category}</span>
                          <span className="text-sm font-semibold text-indigo-600">{count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;