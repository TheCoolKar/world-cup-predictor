import GroupStage from "./pages/GroupStage";
import "./index.css";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white py-6 text-center shadow">
        <h1 className="text-3xl font-bold tracking-tight">World Cup 2026 Predictor</h1>
        <p className="text-green-200 text-sm mt-1">ELO-powered predictions for all 104 matches</p>
      </header>
      <main>
        <GroupStage />
      </main>
    </div>
  );
}
