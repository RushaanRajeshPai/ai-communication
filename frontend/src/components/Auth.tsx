import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import whitelogo from "../assets/whitelogo.png";

const Auth: React.FC = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [gender, setGender] = useState("male");
  const [age, setAge] = useState<number | "">(""); 
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const endpoint = isSignup
      ? "http://localhost:5000/api/users/signup"
      : "http://localhost:5000/api/users/login";

    const body = isSignup
      ? { fullname, email, password, role, gender, age }
      : { email, password };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Something went wrong");

    setMessage(data.message);

    // 👇 ADD THESE LINES - Store userId in localStorage after successful login
    if (!isSignup && data.userId) {
      localStorage.setItem('userId', data.userId);
    }
    
    // For signup, you might also want to store userId and auto-login
    if (isSignup && data.userId) {
      localStorage.setItem('userId', data.userId);
    }

    navigate("/scenario");
  } catch (err: any) {
    setMessage(err.message);
  }
};


  return (
    <div className="w-screen min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, rgb(27, 31, 46) 0%, rgb(20, 24, 38) 50%, rgb(15, 18, 30) 100%)" }}>
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
      <div className="bg-gradient-to-b from-gray-800 to-black shadow-xl rounded-2xl w-full max-w-md p-8 mt-32">
        <h2 className="text-2xl font-bold text-center text-white mb-6">
          {isSignup ? "Create an Account" : "Welcome Back"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <div>
              <label className="block text-white mb-1">Full Name</label>
              <input
                type="text"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                required
                className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-white mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-white mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {isSignup && (
            <div>
              <label className="block text-white mb-1">I am a...</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="student">Student</option>
                <option value="work">Working Professional</option>
              </select>
            </div>
          )}

          {isSignup && (
            <>
              <div>
                <label className="block text-white mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                  className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-white mb-1">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  required
                  className="w-full text-white bg-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full hover:scale-105 text-white font-semibold py-2 rounded-lg "
            style={{
              background: 'linear-gradient(135deg, rgb(13, 148, 136) 0%, rgb(37, 99, 235) 100%)',
              boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)'
            }}>
            {isSignup ? "Sign Up" : "Login"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-sm text-gray-700" >{message}</p>
        )}

        <p className="mt-6 text-center text-sm text-white">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-blue-600 bg-transparent font-bold hover:underline" 
          >
            {isSignup ? "Login here" : "Sign up here"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;