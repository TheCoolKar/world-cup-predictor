export default function Home() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">World Cup 2026 Predictor</h1>
      <p className="text-gray-500 text-lg mb-8">
        ELO-powered win probabilities for all 104 matches across 12 groups.
      </p>
      <a
        href="/groups"
        className="inline-block bg-green-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
      >
        View Group Stage Predictions
      </a>
    </div>
  );
}
