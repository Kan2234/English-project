import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout, DataGate } from './components/Layout';
import Home from './pages/Home';
import TestIntro from './pages/TestIntro';
import Exam from './pages/Exam';
import ResultPage from './pages/ResultPage';
import PracticeIndex from './pages/PracticeIndex';
import Practice from './pages/Practice';
import VocabPage from './pages/VocabPage';
import GrammarPage from './pages/GrammarPage';
import InfoPage from './pages/InfoPage';
import NotFound from './pages/NotFound';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollTo, which useEffect must not receive
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <DataGate>
        <Routes>
          {/* the exam screen has its own full-width bar instead of the site header */}
          <Route path="/de/:testId/lam-bai/:scope" element={<Exam />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/de/:testId" element={<TestIntro />} />
            <Route path="/ket-qua/:attemptId" element={<ResultPage />} />
            <Route path="/luyen-tap" element={<PracticeIndex />} />
            <Route path="/luyen-tap/:partSlug" element={<Practice />} />
            <Route path="/tu-vung" element={<VocabPage />} />
            <Route path="/ngu-phap" element={<GrammarPage />} />
            <Route path="/ngu-phap/:slug" element={<GrammarPage />} />
            <Route path="/ky-thi" element={<InfoPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </DataGate>
    </>
  );
}
