import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Auth from "./components/Auth";
import Scenario from "./components/Scenario";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/scenario" element={<Scenario />} />
      </Routes>
    </Router>
  );
}

export default App;