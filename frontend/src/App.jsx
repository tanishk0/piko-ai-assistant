import React, { useEffect } from "react";
import Login from "../src/pages/Login";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { me } from "./features/auth.js";
import { useDispatch, useSelector } from "react-redux";
import { setUserData } from "./redux/userSlice.js";
import Home from "./pages/Home";

function App() {
  const dispatch = useDispatch();

  const { userData, loading } = useSelector((state) => state.user);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await me();
        dispatch(setUserData(data));
      } catch (error) {
        console.log(error);
      }
    };
    

    fetchUser();
  }, [dispatch]);

  if (loading) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={userData ? <Home /> : <Login />} />
        <Route path="/" element={userData ? <Home /> : <Login />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
