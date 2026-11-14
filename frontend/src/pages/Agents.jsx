import { getAllAgents } from "@/features/agent.js";
import React, { useEffect, useState } from "react";

const Agents = () => {
  const [agents, setAgents] = useState([]);
  const fetchAgents = async () => {
    try {
      const data = await getAllAgents();
      setAgents(data);
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
    fetchAgents();
  }, []);
  const search=()=>{
    
  }

  return (
    <div>
      
    </div>
  )
}

export default Agents
