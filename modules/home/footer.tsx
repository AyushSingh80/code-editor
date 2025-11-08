import React from "react";

// You can use icons from a library like 'react-icons'
// For example: import { VscSourceControl, VscSettingsGear } from 'react-icons/vsc';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-gray-400 text-sm px-4 py-1 flex items-center justify-between border-t border-gray-700">
      {/* Left Section: Git Branch & Copyright */}
      <div className="flex items-center gap-4">
        <a
          href="#"
          className="flex items-center gap-1 hover:bg-gray-700 rounded px-2 py-0.5 transition-colors"
          title="Source Control"
        >
          {/* Replace with an actual icon component if you have one */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
          <span>main</span>
        </a>
        <span className="hidden md:inline">
          &copy; {new Date().getFullYear()} Code Editor
        </span>
      </div>

      {/* Right Section: Editor Status */}
      <div className="flex items-center gap-4">
        <button
          className="hover:bg-gray-700 rounded px-2 py-0.5 transition-colors"
          title="Line & Column"
        >
          Ln 42, Col 5
        </button>
        <button
          className="hidden sm:block hover:bg-gray-700 rounded px-2 py-0.5 transition-colors"
          title="File Encoding"
        >
          UTF-8
        </button>
        <button
          className="hover:bg-gray-700 rounded px-2 py-0.5 transition-colors"
          title="Select Language Mode"
        >
          TypeScript
        </button>
        <button
          className="hover:bg-gray-700 rounded px-2 py-0.5 transition-colors"
          title="Settings"
        >
          {/* Replace with an actual icon component */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </footer>
  );
};

export default Footer;
