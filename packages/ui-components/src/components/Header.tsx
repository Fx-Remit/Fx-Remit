import React from 'react';
import './Header.css';

interface HeaderProps {
  userName: string;
  avatarUrl: string;
}

export const Header: React.FC<HeaderProps> = ({ userName, avatarUrl }) => {
  return (
    <header className="fx-header">
      <div className="header-user">
        <img src={avatarUrl} alt={userName} className="user-avatar" />
        <div className="header-text">
          <span className="user-name">{userName}</span>
          <span className="welcome-back">Welcome back</span>
        </div>
      </div>
      <button className="support-button">
        <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.891.527 3.655 1.442 5.16L2 22l4.84-1.442C8.345 21.473 10.109 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.63 0-3.15-.465-4.44-1.266l-.32-.196L4.2 19.458l.92-3.04-.216-.352A7.95 7.95 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
        </svg>
      </button>
    </header>
  );
};
