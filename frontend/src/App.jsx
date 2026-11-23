import React, { useEffect } from "react";
import Login from "../src/pages/Login";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { me } from "./features/auth.js";
import { useDispatch, useSelector } from "react-redux";
import { setUserData } from "./redux/userSlice.js";
import {
  setAgents,
  setAgentsLoading,
} from "./redux/agentSlice.js";
import Home from "./pages/Home";
import Agents from "./pages/Agents";
import Integration from "./pages/Integration";
import CreateAgent from "./pages/CreateAgent";
import { getAllAgents } from "./features/agent.js";

function App() {
  const dispatch = useDispatch();
  const { userData, loading } = useSelector((state) => state.user);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await me();
        dispatch(setUserData(data || null));
      } catch (error) {
        console.log("Auth fetch error:", error);
        dispatch(setUserData(null));
      }
    };

    fetchUser();
  }, [dispatch]);

  useEffect(() => {
    const fetchAgents = async () => {
      if (!userData) return;
      dispatch(setAgentsLoading(true));
      try {
        const data = await getAllAgents();
        dispatch(setAgents(data || []));
        const data = await me();
        dispatch(setUserData(data || null));
      } catch (error) {
        console.log(error);
        dispatch(setUserData(null));
      }
    };

    fetchUser();
  }, [dispatch]);

  if (loading) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={userData ? <Home /> : <Login />} />
        <Route
          path="/"
          element={userData ? <Home /> : <Navigate to={"/login"} />}
        />
        <Route
          path="/agents"
          element={userData ? <Agents /> : <Navigate to={"/login"} />}
        />
        <Route
          path="/integrations"
          element={userData ? <Integration /> : <Navigate to={"/login"} />}
        />
        <Route
          path="/agents/new"
          element={userData ? <CreateAgent /> : <Navigate to={"/login"} />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
