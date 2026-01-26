import React from 'react';

const Loader: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full p-10">
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-4 h-4 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-4 h-4 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        <span className="ml-4 text-gray-400">Loading...</span>
      </div>
    </div>
  );
};

export default Loader;
