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
    }
  }
})

// Action creators are generated for each case reducer function
export const { setUserData, setLoading } = userSlice.actions

export default userSlice.reducer