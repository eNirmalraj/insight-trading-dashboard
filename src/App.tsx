

import React from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute';
import SignIn from './pages/SignIn';
import MainLayout from './components/MainLayout';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ReactRouterDOM.HashRouter>
        <ReactRouterDOM.Routes>
          <ReactRouterDOM.Route
            path="/signin"
            element={
              <PublicOnlyRoute>
                <SignIn />
              </PublicOnlyRoute>
            }
          />
          <ReactRouterDOM.Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          />
        </ReactRouterDOM.Routes>
      </ReactRouterDOM.HashRouter>
    </AuthProvider>
  );
};

export default App;