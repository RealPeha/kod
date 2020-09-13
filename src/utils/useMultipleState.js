import { useState } from 'react'

const useMultipleState = (initialState) => {
    const [state, setState] = useState(initialState)

    const setMultipleState = newState => {
      setState(prevState => Object.assign({}, prevState, newState))
    }

    return [state, setMultipleState]
}

export default useMultipleState
