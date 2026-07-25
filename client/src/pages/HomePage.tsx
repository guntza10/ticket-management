import NavBar from "../components/NavBar.tsx";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Home</h1>
        <p className="mt-2 text-gray-600">You are signed in.</p>
      </main>
    </div>
  );
}
