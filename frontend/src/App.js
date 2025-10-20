// Libraries
import { BrowserRouter, Routes, Route} from 'react-router-dom'

// Pages
import Landing from './pages/LandingPage.jsx';
import Upload from './pages/UploadPage.jsx';
import Video from './pages/VideosList.jsx';
import Reformat from './pages/ReformatPage.jsx';
import BanUser from './pages/BanUserPage.jsx'

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route index element={<Landing />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/videos" element={<Video />} />
          <Route path="/reformat/:id" element={<Reformat />} />
          <Route path="/ban" element={<BanUser />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;