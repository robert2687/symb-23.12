import React, { useState } from 'react';
import { Theme, User } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (user: User) => void;
  theme: Theme;
}

export function AuthModal({ isOpen, onClose, onAuthenticate, theme }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user: User = {
      id: Date.now().toString(),
      name,
      email,
      avatar: avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name || 'user')}`,
    };
    onAuthenticate(user);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
          theme === 'dark' ? 'bg-[#0f0f12] text-gray-100' : 'bg-white text-gray-900'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Authorize Session</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-transparent"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-transparent"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Avatar URL (optional)</label>
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-transparent"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
