import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Sessions } from './pages/Sessions';
import { StreamingDemo } from './pages/StreamingDemo';
import { APIDocs } from './pages/APIDocs';
import { MCPGuide } from './pages/MCPGuide';
import { Examples } from './pages/Examples';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/streaming" element={<StreamingDemo />} />
          <Route path="/docs" element={<APIDocs />} />
          <Route path="/mcp-guide" element={<MCPGuide />} />
          <Route path="/examples" element={<Examples />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
