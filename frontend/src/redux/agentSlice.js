import {createSlice} from '@reduxjs/toolkit';

export const agentSlice = createSlice ({
  name: 'agent',

  initialState: {
    agents: [],
    selectedAgent: '',
    agentsLoading:false,
  },
  reducers: {
    setAgents: (state, action) => {
      state.agents = action.payload;
    },
    setSelectedAgent: (state, action) => {
      state.selectedAgent = action.payload;
    },
    setAgentsLoading: (state, action) => {
      state.agentsLoading = action.payload;
    },
    setDelete:(state,action)=> {
        const id=action.payload
        state.agents=state.agents.filter((a)=>a?._id!==id)
        if (state.selectedAgent === id) state.selectedAgent = '';
    }
  },
});

// Action creators are generated for each case reducer function
export const {setAgents, setSelectedAgent, setDelete ,setAgentsLoading} = agentSlice.actions;

export default agentSlice.reducer;
