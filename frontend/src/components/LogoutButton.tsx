"use client";

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      // 1. Hit our new kill switch API
      await fetch('/api/auth/logout', { method: 'POST' });
      
      // 2. Hard redirect back to the login perimeter
      window.location.href = '/login';
    } catch (error) {
      console.error("Failed to execute logout", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="mt-4 px-4 py-2 bg-red-900/20 text-red-500 border border-red-900/50 rounded-md hover:bg-red-900/40 transition-all text-sm font-bold tracking-wide shadow-sm"
    >
      CLEAR DEAD SESSION
    </button>
  );
}