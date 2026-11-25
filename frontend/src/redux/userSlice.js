import { createSlice } from '@reduxjs/toolkit'



export const userSlice = createSlice({
  name: 'user',
  
  initialState: {
    userData: null,
    loading: true
  },
  reducers: {
    setUserData: (state, action) => {
        state.userData = action.payload
        state.loading = false
    },
    setLoading: (state, action) => {
        state.loading = action.payload
    },
    setCreditBalance: (state, action) => {
        if (state.userData) {
            state.userData.credits = action.payload.credits;
            if (action.payload.billingDebt !== undefined) state.userData.billingDebt = action.payload.billingDebt;
        }
    }
  }
})

// Action creators are generated for each case reducer function
export const { setUserData, setLoading, setCreditBalance } = userSlice.actions

export default userSlice.reducer
