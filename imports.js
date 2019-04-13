"use strict";

// React dom aliases.
const a = rhh.a;
const br = rhh.br;
const button = rhh.button;
const div = rhh.div;
const form = rhh.form;
const h = rhh.h;
const h2 = rhh.h2;
const h3 = rhh.h3;
const input = rhh.input;
const label = rhh.label;
const span = rhh.span;
const textarea = rhh.textarea;

// React Router aliases.
const Router = window.ReactRouterDOM.HashRouter;
const Route =  window.ReactRouterDOM.Route;
const Link =  window.ReactRouterDOM.Link;
const withRouter = window.ReactRouterDOM.withRouter;
//const Prompt =  window.ReactRouterDOM.Prompt;
//const Switch = window.ReactRouterDOM.Switch;
//const Redirect = window.ReactRouterDOM.Redirect;

// Redux
const applyMiddleware = window.Redux.applyMiddleware;
const createStore = window.Redux.createStore;
const combineReducers = window.Redux.combineReducers;

// React Redux.
const connect = window.ReactRedux.connect;
const Provider = window.ReactRedux.Provider;

// Redux actions.
const createAction = window.ReduxActions.createAction;

// Redux Thunk.
const thunk = window.ReduxThunk.default;

// Redux Form.
const reduxForm = window.ReduxForm.reduxForm;
const Field = window.ReduxForm.Field;

// Plotly.
const Plot = createPlotlyComponent(Plotly);

// From https://stackoverflow.com/a/2117523
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

// From https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#Testing_for_availability
function storageAvailable(type) {
  try {
    var storage = window[type],
        x = '__storage_test__';
    storage.setItem(x, x);
    storage.removeItem(x);
    return true;
  }
  catch(e) {
    return e instanceof DOMException && (
      // everything except Firefox
      e.code === 22 ||
      // Firefox
      e.code === 1014 ||
      // test name field too, because code might not be present
      // everything except Firefox
      e.name === 'QuotaExceededError' ||
      // Firefox
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
      // acknowledge QuotaExceededError only if there's something already stored
      storage.length !== 0;
  }
}

// For determining when page was initially loaded.
const initialLoadTime = Date.now();
