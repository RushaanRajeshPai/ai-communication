import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Auth from "./components/Auth";
import Scenario from "./components/Scenario";
import FreeTopic from './components/FreeTopic';
import Interview from './components/Interview';
import Gd from './components/Gd';
import Footer from './components/Footer';
import footer from './assets/footer.png';
import whitelogo from './assets/whitelogo.png';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/scenario" element={<Scenario />} />
        <Route path="/free-topic" element={<FreeTopic />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/gd" element={<Gd />} />
      </Routes>
      <Footer
        whitelogo={whitelogo}
        footer={footer}
      />
    </Router>
  );
}

export default App;