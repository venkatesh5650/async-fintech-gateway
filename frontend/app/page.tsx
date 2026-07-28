import { fetchIntelligence } from "@/lib/apiClient";

export default async function Home() {
  // Fetch real-time intelligence for Apple (AAPL) through our secure edge bridge
  const data = await fetchIntelligence("AAPL");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-6">
      <div className="max-w-xl w-full bg-gray-800 border border-gray-700 rounded-xl p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            FinTech Intelligence Gateway
          </h1>
          <span className="px-3 py-1 bg-blue-600 text-xs font-semibold rounded-full uppercase">
            {data.ticker}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg border border-gray-700">
            <span className="text-gray-400 text-sm font-medium">
              Algorithmic Signal:
            </span>
            <span
              className={`font-bold px-3 py-1 rounded text-sm ${
                data.signal === "BUY"
                  ? "bg-green-600 text-white"
                  : data.signal === "SELL"
                    ? "bg-red-600 text-white"
                    : "bg-yellow-600 text-white"
              }`}
            >
              {data.signal}
            </span>
          </div>

          <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
            <span className="block text-gray-400 text-sm font-medium mb-1">
              Agent Reasoning:
            </span>
            <p className="text-gray-200 text-sm leading-relaxed">
              {data.reasoning}
            </p>
          </div>

          <div className="text-right text-xs text-gray-500 pt-2">
            Execution Time: {data.execution_time_ms}ms
          </div>
        </div>
      </div>
    </main>
  );
}
