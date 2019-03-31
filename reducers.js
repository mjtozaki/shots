'use strict';

(function(ns = window) {
  
  const auth = (state = {}, action) => {
    switch (action.type) {
      case applyAuth.toString(): {
        return {
          ...state,
          clientId: action.payload.clientId,
          clientSecret: action.payload.clientSecret,
          refreshToken: action.payload.refreshToken,
        };
      }
      
      case purgeAuth.toString(): {
        return {
          ...state,
          clientId: undefined,
          clientSecret: undefined,
          refreshToken: undefined,
        };
      }
      
      default: {
        return state;
      }
    }
  };
  
  const filter = (state = {}, action) => {
    switch (action.type) {
      // Set filter upon receiving shots.
      case 'RECEIVE_SHOTS': {
        return {...action.payload.filter};
      }
      
      // When filter is changed, set it.
      case 'UPDATE_FILTER': {
        return {...action.payload};
      }

      default: {
        return state;
      }
    }
  };

  // Reducer for all redux-forms.
  const form = ReduxForm.reducer.plugin({
    // Reducers by reduxForm() name.
    authSettingsForm: (state, action) => {
      switch(action.type) {
        case purgeAuth.toString():
          return undefined; // Purge form data.
        default:
          return state;
      }
    },
  });

  const options = (state = {
    menu: {
      show: false
    }
  }, action) => {
    switch (action.type) {
      case toggleOptionsMenu.toString(): {
        return {
          ...state,
          menu: {
            ...state.menu,
            show: !state.menu.show,
          },
        }
      }
      default: {
        return state;
      }
    }
  };
  
  const redirect = (state = {}, action) => {
    switch (action.type) {
      case findingRedirect.toString(): {
        return {...state, fetching: true}
      }
      
      case followingRedirect.toString(): {
        return {...state, fetching: false}
      }
      
      default: {
        return state;
      }
    }
  };
  
  const shot = (state = {}, action) => {
    switch (action.type) {
      case requestShot.toString(): {
        return {...state, id: action.payload, fetching: true, error: undefined};
      }
      
      case receiveShot.toString(): {
        if (action.error) {
          return {...state, fetching: false, error: action.payload};
        }
        return {...action.payload, fetching: false, error: undefined}
      }
      
      default: {
        return state;
      }
    }
  };

  const shots = (state = {}, action) => {
    switch (action.type) {
      case requestShotsList.toString(): {
        return {...state, fetching: true, error: undefined};
      }

      case receiveShotsList.toString(): {
        if (action.error) {
          return {...state, fetching: false, error: action.payload};
        }
        return {...action.payload, fetching: false, error: undefined};
      }
      
      default: {
        return state;
      }
    }
  };

  ns.rootReducer = combineReducers({
    auth,
    filter,
    form,
    options,
    redirect,
    shot,
    shots,
  });
})();
