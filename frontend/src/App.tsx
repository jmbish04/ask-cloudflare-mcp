import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

import { Sessions } from './pages/Sessions';
import { AnalysisTools } from './pages/AnalysisTools';

import { MCPGuide } from './pages/MCPGuide';
import { Examples } from './pages/Examples';
import { ResearchPage } from './pages/ResearchPage';
import { Health } from './pages/Health';
import { Documentation } from './pages/Documentation';
import { LandingPage } from './pages/LandingPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/research/:sessionId" element={<ResearchPage />} />
          <Route path="/health" element={<Health />} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/tools" element={<AnalysisTools />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/mcp-guide" element={<MCPGuide />} />
          <Route path="/examples" element={<Examples />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
