import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Auth from "./components/Auth";
import Scenario from "./components/Scenario";
import Free from './components/Free'
import Story from './components/Story';
import Interview from './components/Interview';
import Gd from './components/Gd';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard'
import footer from './assets/footer.png';
import whitelogo from './assets/whitelogo.png';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/scenario" element={<Scenario />} />
        <Route path="/free-topic" element={<Free />} />
        <Route path="/storytelling" element={<Story />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/gd" element={<Gd />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
      <Footer
        whitelogo={whitelogo}
        footer={footer}
      />
    </Router>
  );
}

export default App;